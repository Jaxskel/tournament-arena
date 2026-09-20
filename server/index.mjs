import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, symlink, appendFile } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import { attachGateway, makeTicket, allowedOrigin } from "./gateway.mjs";
import {
  canonicalRoom,
  nextMap,
  mapName,
  parseStartedMap,
  trackBotSlots,
} from "./rooms.mjs";
import { publicPolicy, modeForRoom } from "./modes.mjs";
import { decodeNativeRecord } from "./native-record.mjs";
import { MatchTracker } from "./match.mjs";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 8787),
  HOST = process.env.HOST || "127.0.0.1";
const runtime = resolve(process.env.ARENA_RUNTIME || join(ROOT, "runtime")),
  secret = randomBytes(32),
  children = [],
  rooms = new Map();
const origins = (process.env.ARENA_ALLOWED_ORIGINS || "")
  .split(",")
  .filter(Boolean);
const definitions = [
  {
    id: "arena",
    name: "Frag Race",
    map: "oa_dm1",
    port: 27960,
    bots: 6,
  },
  { id: "ppk", name: "PPK", map: "oa_dm1", port: 27964, bots: 6 },
  {
    id: "practice",
    name: "Bot practice",
    map: "oa_dm1",
    port: 27962,
    bots: 6,
    practice: true,
  },
];
await mkdir(join(runtime, "baseq3"), { recursive: true });
const pack = join(ROOT, "public/assets/arena.pk3");
if (!existsSync(pack)) throw Error("Run npm run assets first.");
await symlink(pack, join(runtime, "baseq3/arena.pk3")).catch((e) => {
  if (e.code !== "EEXIST") throw e;
});
function event(data) {
  appendFile(
    join(runtime, "events.jsonl"),
    JSON.stringify({
      eventId: randomUUID(),
      at: new Date().toISOString(),
      rewardEligible: false,
      ...data,
    }) + "\n",
  ).catch(console.error);
}
for (const def of definitions) {
  const home = join(runtime, def.id),
    sessionDir = join(home, "sessions");
  await mkdir(sessionDir, { recursive: true });
  await mkdir(join(home, "baseq3"), { recursive: true });
  const room = {
    ...def,
    port: def.port + Number(process.env.ARENA_PORT_OFFSET || 0),
    sessionDir,
    logNonce: randomBytes(24).toString("hex"),
    ready: false,
    round: 0,
    botSlots: new Set(),
    tracker: new MatchTracker(def.id, {
      fraglimit: Number(
        process.env.ARENA_FRAGLIMIT ?? modeForRoom(def.id).fraglimit,
      ),
      minutes: Number(process.env.ARENA_TIMELIMIT || 15),
    }),
  };
  rooms.set(def.id, room);
  const settings = {
    arena_logNonce: room.logNonce,
    com_basegame: "baseq3",
    dedicated: 2,
    net_ip: "127.0.0.1",
    net_port: def.port + Number(process.env.ARENA_PORT_OFFSET || 0),
    net_enabled: 1,
    fs_basepath: runtime,
    fs_homepath: home,
    sv_hostname: `Tournament Arena - ${def.name}`,
    sv_maxclients: 16,
    g_maxGameClients: 12,
    sv_pure: 1,
    sv_allowDownload: 0,
    g_allowVote: 0,
    g_arenaAutoRotate: 1,
    g_gametype: 0,
    g_log: "games.log",
    g_logSync: 1,
    fraglimit: process.env.ARENA_FRAGLIMIT ?? modeForRoom(def.id).fraglimit,
    timelimit: process.env.ARENA_TIMELIMIT || 15,
    nextmap: "map oa_rpg3dm2",
    sv_fps: 40,
    sv_timeout: 45,
    sv_reconnectlimit: 0,
    bot_enable: 1,
    bot_minplayers: 0,
    bot_arenaCount: def.bots,
    g_spSkill: 2,
    sv_master1: "",
    sv_master2: "",
    vm_game: 2,
  };
  const args = Object.entries(settings)
    .flatMap(([k, v]) => ["+set", k, String(v)])
    .concat(
      ["+map", def.map],
      Array.from({ length: def.bots }, (_, i) => [
        "+addbot",
        ["Sarge", "Grunt", "Beret"][i % 3],
        "2",
      ]).flat(),
    );
  const child = spawn(
    process.env.ARENA_SERVER_BINARY || join(ROOT, "bin/ioq3ded"),
    args,
    {
      cwd: ROOT,
      env: { ...process.env, ARENA_SESSION_DIR: sessionDir },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  children.push(child);
  room.child = child;
  let remainder = "",
    lineSequence = 0;
  function consume(chunk) {
    appendFile(join(home, "server.log"), chunk).catch(() => {});
    remainder += chunk;
    const lines = remainder.split("\n");
    remainder = lines.pop();
    for (const rawLine of lines) {
      const line = decodeNativeRecord(rawLine, room.logNonce);
      if (line === null) continue;
      room.tracker.consume(line, ++lineSequence);
      trackBotSlots(room, line);
      if (line.startsWith("InitGame:")) {
        room.map = parseStartedMap(line) || room.map;
        room.nextMap = nextMap(room.map);
        room.child.stdin.write(`set nextmap "map ${room.nextMap}"\n`);
        room.ready = true;
        event({
          type: "round.started",
          room: def.id,
          map: room.map,
          round: ++room.round,
        });
      }
      const kill = line.match(/^Kill: (\d+) (\d+) (\d+): (.*)/);
      if (kill)
        event({
          type: "game.kill",
          room: def.id,
          attackerSlot: +kill[1],
          victimSlot: +kill[2],
          meansOfDeath: +kill[3],
          description: kill[4],
        });
      if (line.startsWith("Exit:"))
        event({
          type: "round.finished",
          room: def.id,
          reason: line.split("Exit:")[1].trim(),
        });
      const identity = line.match(/^ClientUserinfoChanged: (\d+) (.*)/);
      if (identity)
        event({
          type: "game.identity",
          room: def.id,
          slot: +identity[1],
          userinfo: identity[2],
        });
    }
  }
  child.stdout.on("data", consume);
  child.stderr.on("data", consume);
  child.on("error", (e) => {
    room.ready = false;
    console.error(`${def.id}: ${e.message}`);
  });
  child.on("exit", (code) => {
    room.ready = false;
    console.error(`${def.id} exited: ${code}`);
    event({ type: "server.exited", room: def.id, code });
  });
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".pk3": "application/octet-stream",
  ".gz": "application/gzip",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};
function json(res, code, data) {
  res.writeHead(code, {
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://arena");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (url.pathname === "/healthz")
      return json(res, [...rooms.values()].every((r) => r.ready) ? 200 : 503, {
        ok: [...rooms.values()].every((r) => r.ready),
        integration: "demo",
        rewards: false,
      });
    if (url.pathname === "/api/config")
      return json(res, 200, {
        mode: "demo",
        policy: publicPolicy(),
        rewards: false,
        engine: "ioquake3",
        parentOrigins: origins,
        websocketPath: "/ws",
        defaultRoom: "arena",
        fraglimit: Number(process.env.ARENA_FRAGLIMIT || 30),
      });
    if (url.pathname === "/api/rooms")
      return json(res, 200, {
        rooms: [...rooms.values()].map((r) => ({
          id: r.id,
          name: r.name,
          mode: modeForRoom(r.id).id,
          map: r.map,
          mapName: mapName(r.map),
          nextMap: nextMap(r.map),
          round: r.round,
          rotation: true,
          practice: !!r.practice,
          ready: r.ready,
          maxPlayers: 6,
          targetBots: r.bots,
          maxCombatants: 12,
          maxWatchers: 4,
          players: [...gateway.sessions].filter(
            (s) => s.claims?.room === r.id && !s.claims.watch,
          ).length,
          watchers: [...gateway.sessions].filter(
            (s) => s.claims?.room === r.id && s.claims.watch,
          ).length,
          bots: r.botSlots.size,
        })),
      });
    if (url.pathname === "/api/demo/ticket" && req.method === "POST") {
      if (
        req.headers.origin &&
        !allowedOrigin(req.headers.origin, req.headers.host, origins)
      )
        return json(res, 403, { error: "Origin rejected" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, 415, { error: "JSON required" });
      let body = "";
      for await (const part of req) {
        body += part;
        if (body.length > 4096) return json(res, 413, { error: "Too large" });
      }
      const input = JSON.parse(body),
        room = rooms.get(canonicalRoom(input.room));
      if (!room?.ready) return json(res, 503, { error: "Room unavailable" });
      const name =
        String(input.name || "Ranger")
          .replace(/[^A-Za-z0-9_-]/g, "")
          .slice(0, 20) || "Ranger";
      return json(res, 200, {
        ticket: makeTicket(secret, {
          room: room.id,
          name,
          watch: input.watch === true,
        }),
        expiresIn: 60,
        demo: true,
      });
    }
    if (!["GET", "HEAD"].includes(req.method))
      return json(res, 405, { error: "Method not allowed" });
    let base = join(ROOT, "public"),
      relative = decodeURIComponent(url.pathname).replace(/^\//, "");
    if (["", "index.html", "play", "host", "credits"].includes(relative)) {
      base = join(ROOT, "web");
      relative =
        relative === "host"
          ? "host.html"
          : relative === "credits"
            ? "credits.html"
            : "index.html";
    } else if (relative.startsWith("web/")) {
      base = join(ROOT, "web");
      relative = relative.slice(4);
    }
    const file = resolve(base, relative);
    if (!file.startsWith(base + "/"))
      return json(res, 403, { error: "Forbidden" });
    const info = await stat(file);
    if (!info.isFile()) return json(res, 404, { error: "Not found" });
    res.setHeader(
      "content-type",
      types[extname(file)] || "application/octet-stream",
    );
    res.setHeader("content-length", info.size);
    res.setHeader(
      "cache-control",
      url.searchParams.has("v")
        ? "public,max-age=31536000,immutable"
        : "no-cache",
    );
    if (req.method === "HEAD") return res.end();
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  } catch (e) {
    if (!res.headersSent)
      json(res, e.code === "ENOENT" ? 404 : 400, {
        error: "Request could not be completed",
      });
    else res.destroy();
  }
});
const gateway = attachGateway(server, {
  rooms,
  secret,
  allowedOrigins: origins,
  onEvent: event,
  getMatchState: (room) => rooms.get(room)?.tracker.snapshot(),
});
server.listen(PORT, HOST, () =>
  console.log(
    `Tournament Arena: http://${HOST}:${PORT} (demo; rewards disabled)`,
  ),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  gateway.close();
  server.close();
  for (const child of children) {
    if (child.stdin.writable) child.stdin.write("quit\n");
    setTimeout(() => child.kill("SIGTERM"), 1000).unref();
  }
  setTimeout(() => process.exit(), 1500).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
