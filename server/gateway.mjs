import dgram from "node:dgram";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { WebSocketServer } from "ws";
export function signTicket(secret, claims) {
  const data = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
export function verifyTicket(secret, token, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2048)
    throw Error("INVALID_TICKET");
  const [data, sig, extra] = token.split(".");
  if (!data || !sig || extra) throw Error("INVALID_TICKET");
  const expected = createHmac("sha256", secret).update(data).digest(),
    actual = Buffer.from(sig, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw Error("INVALID_TICKET");
  const c = JSON.parse(Buffer.from(data, "base64url").toString());
  if (
    !Number.isSafeInteger(c.exp) ||
    c.exp <= now ||
    !c.id ||
    !c.jti ||
    typeof c.watch !== "boolean" ||
    !/^[A-Za-z0-9_-]{1,20}$/.test(c.name) ||
    !/^[a-z0-9-]{1,40}$/.test(c.room)
  )
    throw Error("INVALID_TICKET");
  return c;
}
export function makeTicket(secret, { room, name, watch = false }) {
  return signTicket(secret, {
    room,
    name,
    watch,
    id: randomUUID(),
    jti: randomUUID(),
    exp: Date.now() + 60000,
    aud: "arena-demo",
  });
}
export function allowedOrigin(origin, host, allow = []) {
  try {
    const u = new URL(origin);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      (u.host === host || allow.includes(u.origin))
    );
  } catch {
    return false;
  }
}
export function gamePacketDelay(data, watch, delay = 5000) {
  // Only transport establishment bypasses the observer buffer. Status replies
  // can contain live scores and must follow the same delay as snapshots.
  const handshake =
    data.length >= 4 &&
    data.readInt32LE(0) === -1 &&
    /^(challengeResponse|connectResponse)(?: |\n|$)/.test(
      data.subarray(4, 64).toString("latin1"),
    );
  return watch && !handshake ? delay : 0;
}
export function attachGateway(
  server,
  {
    rooms,
    secret,
    allowedOrigins = [],
    onEvent = () => {},
    spectatorDelay = 5000,
  },
) {
  const wss = new WebSocketServer({
      noServer: true,
      maxPayload: 65536,
      perMessageDeflate: false,
    }),
    sessions = new Set(),
    used = new Map();
  server.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/ws" ||
      !allowedOrigin(req.headers.origin, req.headers.host, allowedOrigins) ||
      sessions.size >= 32
    )
      return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    const s = {
      ws,
      claims: null,
      udp: null,
      file: null,
      queue: [],
      queuedBytes: 0,
    };
    sessions.add(s);
    let authenticated = false,
      authenticating = false,
      alive = true,
      packets = 0,
      windowAt = Date.now();
    const deadline = setTimeout(() => ws.close(4401, "Ticket required"), 5000);
    const heartbeat = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, 15000);
    ws.on("pong", () => (alive = true));
    const pump = setInterval(() => {
      while (s.queue.length && s.queue[0].due <= performance.now()) {
        const p = s.queue.shift();
        s.queuedBytes -= p.data.length;
        if (ws.readyState === 1) ws.send(p.data, { binary: true });
      }
    }, 10);
    async function cleanup() {
      clearTimeout(deadline);
      clearInterval(pump);
      clearInterval(heartbeat);
      sessions.delete(s);
      s.queue = [];
      try {
        s.udp?.close();
      } catch {}
      if (s.file) await unlink(s.file).catch(() => {});
      if (s.claims)
        onEvent({
          type: "session.closed",
          id: s.claims.id,
          room: s.claims.room,
        });
    }
    ws.on("message", async (data, binary) => {
      try {
        if (!authenticated) {
          if (binary || authenticating)
            return ws.close(4401, "Ticket required");
          authenticating = true;
          const message = JSON.parse(data.toString());
          if (message.type !== "auth") throw Error("INVALID_TICKET");
          const c = verifyTicket(secret, message.ticket);
          if (c.aud !== "arena-demo") throw Error("INVALID_TICKET");
          const room = rooms.get(c.room);
          if (!room?.ready) throw Error("ROOM_UNAVAILABLE");
          if (used.has(c.jti)) throw Error("TICKET_REUSED");
          if (
            [...sessions].filter(
              (x) => x.claims?.room === c.room && !x.claims.watch,
            ).length >= 6 &&
            !c.watch
          )
            throw Error("ROOM_FULL");
          if (
            c.watch &&
            [...sessions].filter(
              (x) => x.claims?.room === c.room && x.claims.watch,
            ).length >= 4
          )
            throw Error("WATCHERS_FULL");
          used.set(c.jti, c.exp);
          s.claims = c;
          for (const [id, exp] of used) if (exp < Date.now()) used.delete(id);
          const udp = dgram.createSocket("udp4");
          s.udp = udp;
          await new Promise((ok, no) => {
            udp.once("error", no);
            udp.bind(0, "127.0.0.1", ok);
          });
          s.file = join(room.sessionDir, String(udp.address().port));
          await writeFile(s.file, `${c.watch ? 1 : 0} ${c.name} ${c.id}\n`, {
            mode: 0o600,
          });
          if (ws.readyState !== 1) {
            await cleanup();
            return;
          }
          udp.on("message", (packet, from) => {
            if (from.address !== "127.0.0.1" || from.port !== room.port) return;
            if (ws.bufferedAmount > 1048576 || s.queuedBytes > 4194304)
              return ws.close(4408, "Connection too slow");
            const delay = gamePacketDelay(packet, c.watch, spectatorDelay);
            if (delay) {
              s.queue.push({ data: packet, due: performance.now() + delay });
              s.queuedBytes += packet.length;
            } else if (ws.readyState === 1) ws.send(packet, { binary: true });
          });
          udp.on("error", () => ws.close(4500, "Game transport unavailable"));
          authenticated = true;
          clearTimeout(deadline);
          ws.send(
            JSON.stringify({
              type: "authenticated",
              room: c.room,
              watch: c.watch,
              delayMs: c.watch ? spectatorDelay : 0,
              id: c.id,
              name: c.name,
            }),
          );
          onEvent({
            type: "session.opened",
            id: c.id,
            name: c.name,
            room: c.room,
            watch: c.watch,
          });
          return;
        }
        if (!binary) return ws.close(4400, "Binary game packets required");
        if (data.length < 4 || data.length > 16384)
          return ws.close(4400, "Invalid packet size");
        if (Date.now() - windowAt > 1000) {
          packets = 0;
          windowAt = Date.now();
        }
        if (++packets > 250) return ws.close(4429, "Packet rate exceeded");
        if (
          data.readInt32LE(0) === -1 &&
          !/^(getchallenge |connect |getinfo |getstatus\s|disconnect\s)/.test(
            data.subarray(4, 48).toString("latin1"),
          )
        )
          return ws.close(4403, "Command not allowed");
        s.udp.send(data, rooms.get(s.claims.room).port, "127.0.0.1");
      } catch (e) {
        ws.close(4401, String(e.message).slice(0, 100));
      }
    });
    ws.on("error", () => {});
    ws.once("close", cleanup);
  });
  return {
    sessions,
    close: () => {
      for (const s of sessions) s.ws.terminate();
      wss.close();
    },
  };
}
