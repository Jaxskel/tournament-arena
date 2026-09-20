import { createBridge } from "./bridge.js";
import { createDiagnostics } from "./diagnostics.js";
const $ = (id) => document.getElementById(id),
  params = new URLSearchParams(location.search);
const mapNames = { oa_dm1: "The Atrium", oa_rpg3dm2: "Reactor" };
const embedded = params.get("embed") === "1";
if (embedded) document.body.classList.add("embedded");
let engine,
  transport,
  roomId = params.get("room") === "practice" ? "practice" : "arena",
  watch = params.get("watch") === "1";
const state = (window.arena = {
  phase: "lobby",
  control: "capture",
  stats: {},
  events: [],
  scores: [],
  command: (cmd) => engine?.ccall("Arena_Command", null, ["string"], [cmd]),
});
const diagnostics = createDiagnostics(
  () => state,
  () => transport,
);
state.diagnostics = diagnostics.report;
let configError;
async function fetchJSON(url) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw Error("Game server unavailable (" + r.status + ").");
  return r.json();
}
const config = await fetchJSON("/api/config").catch((error) => {
  configError = error;
  diagnostics.record("configuration", error.message);
  return {};
});
const bridge = createBridge({
  embedded,
  allowedOrigins: [location.origin, ...(config.parentOrigins || [])],
});
const canvas = $("canvas"),
  nativePointerLock = canvas.requestPointerLock?.bind(canvas);
// SDL's deferred lock requests otherwise compete with menu controls. Only a
// real Resume/canvas gesture may request capture; SDL still observes changes.
canvas.requestPointerLock = () => Promise.resolve();
function saved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
const nameInput = $("player-name");
try {
  nameInput.value = localStorage.getItem("arena-name") || "Ranger";
} catch {}
nameInput.onchange = () => {
  try {
    localStorage.setItem(
      "arena-name",
      nameInput.value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20),
    );
  } catch {}
};
function launch(room, isWatch = false) {
  location.href =
    "/play?" +
    new URLSearchParams({
      room,
      watch: isWatch ? "1" : "0",
      name: nameInput.value || "Ranger",
    });
}
$("quickplay").onclick = () => launch("arena");
$("practice-play").onclick = () => launch("practice");
let roomList = [],
  filter = "all",
  lobbyPing = null;
async function renderRooms() {
  const began = performance.now();
  const data = await fetchJSON("/api/rooms");
  $("server-error").hidden = true;
  lobbyPing = Math.round(performance.now() - began);
  roomList = data.rooms;
  $("practice-play").disabled = !roomList.find((r) => r.id === "practice")
    ?.ready;
  drawRooms();
}
function drawRooms() {
  $("online-count").textContent =
    roomList.reduce((n, r) => n + r.players, 0) + " in game";
  $("lobby-ping").textContent = lobbyPing + " ms";
  const main = roomList.find((r) => r.id === "arena");
  if (main) {
    $("next-description").textContent =
      `${main.mapName} · Deathmatch · Maps rotate automatically`;
    $("next-count").textContent =
      `${main.players}/6 humans · ${main.bots} bots`;
    $("quickplay").disabled = !main.ready || main.players >= 6;
  }
  let rooms = roomList.filter(
    (r) =>
      (filter === "all" || (filter === "practice") === r.practice) &&
      r.name.toLowerCase().includes($("server-search").value.toLowerCase()) &&
      (!$("with-players").checked || r.players > 0) &&
      (!$("open-only").checked || r.players < 6),
  );
  if ($("server-sort").value === "players")
    rooms.sort((a, b) => b.players - a.players);
  $("rooms").replaceChildren(
    ...rooms.map((r) => {
      const tr = document.createElement("tr");
      if (!r.practice) tr.className = "recommended";
      const values = [
        r.name,
        r.mapName || mapNames[r.map],
        r.practice ? "Practice" : "Deathmatch",
        `${r.players} / 6`,
        lobbyPing + " ms",
      ];
      values.forEach((value, i) => {
        const td = document.createElement("td"),
          span = document.createElement(i === 0 ? "strong" : "span");
        span.textContent = value;
        td.append(span);
        if (i < 2) {
          const detail = document.createElement("small");
          detail.textContent =
            i === 0
              ? `${r.bots} ${r.bots === 1 ? "bot" : "bots"} · ${r.practice ? "Warm up" : "Always in the match"}`
              : "Automatic rotation";
          td.append(detail);
        }
        tr.append(td);
      });
      const td = document.createElement("td"),
        actions = document.createElement("div");
      actions.className = "v2-actions";
      if (!r.practice) {
        const b = document.createElement("button");
        b.className = "v2-btn server-row-watch";
        b.textContent = "Watch";
        b.setAttribute("aria-label", "Watch " + r.name);
        b.onclick = () => launch(r.id, true);
        b.disabled = !r.ready;
        actions.append(b);
      }
      const join = document.createElement("button");
      join.className = "v2-btn primary server-row-join";
      join.textContent = !r.ready
        ? "Starting"
        : r.players >= 6
          ? "Full"
          : "Join";
      join.setAttribute("aria-label", "Join " + r.name);
      join.disabled = !r.ready || r.players >= 6;
      join.onclick = () => launch(r.id);
      actions.append(join);
      td.append(actions);
      tr.append(td);
      return tr;
    }),
  );
  if (!rooms.length) {
    const row = document.createElement("tr"),
      cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty";
    cell.textContent = "No servers match your filters.";
    row.append(cell);
    $("rooms").append(row);
  }
  $("server-summary").textContent =
    `${rooms.length} servers · Automatic map rotation`;
}
for (const el of document.querySelectorAll("[data-filter]"))
  el.onclick = () => {
    filter = el.dataset.filter;
    for (const b of document.querySelectorAll("[data-filter]")) {
      const active = b === el;
      b.classList.toggle("active", active);
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", active);
    }
    drawRooms();
  };
for (const id of ["server-search", "server-sort", "with-players", "open-only"])
  $(id).addEventListener("input", drawRooms);
$("how-to-play").onclick = () => $("help").showModal();
$("help-close").onclick = () => $("help").close();
for (const button of document.querySelectorAll("[data-help]"))
  button.onclick = () => $("help").showModal();
for (const button of document.querySelectorAll("[data-diagnostics]"))
  button.onclick = () => {
    if (state.phase === "playing") openSettings();
    diagnostics.open();
  };
$("retry-server").onclick = () => {
  if (configError) location.reload();
  else renderRooms().catch(roomFailure);
};
function roomFailure(error) {
  $("online-count").textContent = "Connection unavailable";
  $("quickplay").disabled = true;
  $("practice-play").disabled = true;
  $("server-error").hidden = false;
  $("server-error-message").textContent =
    "Cannot reach the game server. Retry in a moment.";
  diagnostics.record("directory", error.message);
}
function progress(text, percent, detail) {
  $("load-status").textContent = text;
  $("progress").value = percent;
  if (detail) $("load-detail").textContent = detail;
}
function fail(error) {
  if (state.phase === "error") return;
  state.phase = "error";
  state.error = String(error.message || error);
  diagnostics.record("error", state.error);
  transport?.close();
  document.exitPointerLock?.();
  $("loading").hidden = false;
  $("board").hidden = true;
  $("capture").hidden = true;
  $("load-title").textContent = "Could not enter the arena";
  progress(
    state.error,
    0,
    "Use Debug for connection details, or retry to reconnect.",
  );
  $("retry").hidden = false;
  bridge.emit("error", { message: state.error });
}
$("retry").onclick = () => location.reload();
async function assets() {
  state.assets = { stage: "manifest", verified: false };
  const manifest = await fetch("/assets/manifest.json", {
    signal: AbortSignal.timeout(15000),
  }).then((r) => {
    if (!r.ok) throw Error("Game manifest unavailable.");
    return r.json();
  });
  const files = [];
  const cache = await caches.open("tournament-arena-v1").catch(() => null);
  for (const file of manifest.files) {
    const url = file.url + "?v=" + file.sha256;
    let response = await cache?.match(url);
    let cached = !!response;
    state.assets = {
      stage: "downloading",
      source: cached ? "Browser cache" : "Network",
      verified: false,
      received: 0,
      bytes: file.bytes,
    };
    if (!response) {
      response = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw Error("Game assets could not be downloaded.");
    }
    const reader = response.body.getReader();
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      state.assets.received = received;
      progress(
        cached ? "Loading cached arena…" : "Downloading arena…",
        8 + (received / file.bytes) * 70,
        `${(received / 1048576).toFixed(1)} / ${(file.bytes / 1048576).toFixed(1)} MB`,
      );
    }
    const data = new Uint8Array(received);
    let at = 0;
    for (const chunk of chunks) {
      data.set(chunk, at);
      at += chunk.length;
    }
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== file.sha256) {
      await cache?.delete(url);
      throw Error("Asset verification failed. Please try again.");
    }
    if (!cached) await cache?.put(url, new Response(data)).catch(() => {});
    state.assets.stage = "ready";
    state.assets.verified = true;
    diagnostics.record(
      "assets",
      `Loaded ${received} bytes; SHA-256 verified (${cached ? "cache" : "network"}).`,
    );
    files.push({ ...file, data });
  }
  return files;
}
async function getTicket() {
  if (bridge.active) return bridge.ticket(roomId === "practice");
  const response = await fetch("/api/demo/ticket", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      room: roomId,
      name: params.get("name") || "Ranger",
      watch,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result.ticket;
}
async function connect(ticket) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`,
    );
    ws.binaryType = "arraybuffer";
    const queue = [];
    let ready = false;
    const timeout = setTimeout(() => {
      ws.close();
      reject(Error("Game connection timed out."));
    }, 10000);
    const t = {
      queue,
      metrics: {
        sentPackets: 0,
        receivedPackets: 0,
        sentBytes: 0,
        receivedBytes: 0,
      },
      send(data) {
        if (ws.readyState === 1 && ready && ws.bufferedAmount < 1048576) {
          ws.send(data);
          t.metrics.sentPackets++;
          t.metrics.sentBytes += data.byteLength;
        }
      },
      close() {
        ws.close();
      },
      ws,
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", ticket }));
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        const message = JSON.parse(e.data);
        if (message.type === "authenticated") {
          clearTimeout(timeout);
          ready = true;
          diagnostics.record(
            "transport",
            "Session admitted to " + message.room,
          );
          resolve(t);
        }
      } else {
        if (queue.length > 512) {
          ws.close(4408, "Client too slow");
          return;
        }
        t.metrics.receivedPackets++;
        t.metrics.receivedBytes += e.data.byteLength;
        queue.push(new Uint8Array(e.data));
      }
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      if (!ready) reject(Error("Unable to reach the game server."));
    };
    ws.onclose = (e) => {
      diagnostics.record(
        "transport",
        `Socket closed (${e.code}): ${e.reason || "Connection ended"}`,
      );
      clearTimeout(timeout);
      if (!ready) reject(Error(e.reason || "Game session rejected."));
      else if (state.phase === "playing" || state.phase === "connecting") {
        bridge.emit("kicked", {
          reason: e.reason || "Connection closed",
          code: e.code,
        });
        fail(Error(e.reason || "Connection lost. Reconnect to continue."));
      }
    };
  });
}

const preferences = saved("arena-controls-v2", {
  sensitivity: 1,
  volume: 85,
  sound: true,
  music: false,
});
const clamp = (n, min, max, fallback) =>
  Number.isFinite(Number(n))
    ? Math.min(max, Math.max(min, Number(n)))
    : fallback;
$("sensitivity").value = clamp(preferences.sensitivity, 0.2, 3, 1);
$("volume").value = clamp(preferences.volume, 0, 100, 85);
let musicMap = null;
function applySettings() {
  preferences.sensitivity = Number($("sensitivity").value);
  preferences.volume = Number($("volume").value);
  $("sensitivity-value").textContent = preferences.sensitivity.toFixed(1) + "x";
  $("volume-value").textContent = preferences.volume + "%";
  for (const key of ["sound", "music"]) {
    $(key + "-toggle").textContent = preferences[key] ? "ON" : "OFF";
    $(key + "-toggle").setAttribute("aria-pressed", !!preferences[key]);
  }
  save("arena-controls-v2", preferences);
  if (
    engine &&
    preferences.music &&
    state.stats.map &&
    musicMap !== state.stats.map
  ) {
    state.command("music music/OA01.ogg");
    musicMap = state.stats.map;
  }
  state.command(
    `sensitivity ${preferences.sensitivity * 3}; s_volume ${preferences.sound ? preferences.volume / 100 : 0}; s_musicvolume ${preferences.music ? 0.35 : 0}`,
  );
}
for (const key of ["sensitivity", "volume"]) $(key).oninput = applySettings;
$("sensitivity-reset").onclick = () => {
  $("sensitivity").value = 1;
  applySettings();
};
for (const key of ["sound", "music"])
  $(key + "-toggle").onclick = () => {
    preferences[key] = !preferences[key];
    applySettings();
  };
applySettings();
let captureEpoch = 0,
  capturePending = false,
  lastUnlockAt = 0;
function releaseInput() {
  engine?._Arena_ReleaseInput();
  state.command(
    "-attack; -forward; -back; -moveleft; -moveright; -moveup; -movedown; -left; -right; -lookup; -lookdown",
  );
}
function showCapture(
  message = "WASD MOVE · MOUSE AIM · SPACE JUMP · ESC MENU",
) {
  if (state.phase !== "playing") return;
  state.control = "capture";
  $("board").hidden = true;
  $("capture").hidden = false;
  $("capture-hint").textContent = message;
}
function openSettings() {
  if (state.phase !== "playing") return;
  captureEpoch++;
  capturePending = false;
  state.control = "settings";
  releaseInput();
  $("capture").hidden = true;
  $("board").hidden = false;
  document.exitPointerLock?.();
  requestScores();
  renderBoard();
  $("resume-button").focus({ preventScroll: true });
}
function captureReady() {
  if (document.pointerLockElement !== canvas || state.phase !== "playing")
    return;
  capturePending = false;
  state.control = "playing";
  $("board").hidden = true;
  $("capture").hidden = true;
  engine?._Arena_Resume();
}
function captureFailed(epoch, error) {
  if (epoch !== captureEpoch || document.pointerLockElement === canvas) return;
  capturePending = false;
  releaseInput();
  showCapture(
    "Mouse capture was not granted. Click Play again, or open this game in a desktop browser.",
  );
  diagnostics.record("controls", error?.message || "Mouse capture unavailable");
  state.captureError = String(
    error?.message || error || "Mouse capture unavailable",
  );
}
function resume() {
  if (state.phase !== "playing" || capturePending) return;
  const epoch = ++captureEpoch;
  capturePending = true;
  state.control = "capturing";
  $("board").hidden = true;
  $("capture").hidden = true;
  engine?._Arena_Resume();
  canvas.focus({ preventScroll: true });
  const acquire = () => {
    if (epoch !== captureEpoch) return;
    try {
      const result = nativePointerLock?.();
      result
        ?.then(() => {
          if (epoch === captureEpoch) captureReady();
        })
        .catch((error) => captureFailed(epoch, error));
      setTimeout(() => {
        if (epoch === captureEpoch && capturePending) {
          if (document.pointerLockElement === canvas) captureReady();
          else captureFailed(epoch);
        }
      }, 900);
    } catch (error) {
      captureFailed(epoch, error);
    }
  };
  // Chrome briefly blocks recapture after Escape. Keep this explicit Resume
  // gesture pending through that cooldown, and cancel it on blur/menu changes.
  const cooldown = Math.max(0, 1300 - (Date.now() - lastUnlockAt));
  if (cooldown) setTimeout(acquire, cooldown);
  else acquire();
}
$("resume-button").onclick = resume;
$("capture-button").onclick = resume;
$("canvas").onclick = () => {
  if (state.control === "capture") resume();
};
$("settings-button").onclick = openSettings;
$("capture-settings").onclick = openSettings;
$("fullscreen").onclick = () => {
  const promise = $("stage").requestFullscreen?.();
  promise?.catch(() => {});
};
$("reconnect").onclick = () => location.reload();
let respawnTimer,
  respawning = false,
  lastScoreAt = 0;
$("respawn").onclick = () => {
  if (watch || respawning) return;
  respawning = true;
  clearTimeout(respawnTimer);
  respawnTimer = setTimeout(
    () => {
      state.command("cmd kill");
      respawnTimer = setTimeout(() => {
        state.command("+attack");
        setTimeout(() => {
          state.command("-attack");
          respawning = false;
        }, 180);
      }, 1500);
    },
    Math.max(0, 1100 - (Date.now() - lastScoreAt)),
  );
  resume();
};
// Intercept Escape before SDL's hard-coded native UI path. Unbinding ESCAPE
// alone is insufficient in ioquake3. UI gestures never leak into game input.
window.addEventListener(
  "keydown",
  (event) => {
    if (diagnostics.isOpen()) {
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        $("diagnostics").close();
      }
      return;
    }
    if (state.phase !== "playing") return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.control === "settings") resume();
      else openSettings();
      return;
    }
    if (state.control !== "playing") {
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSettings();
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      event.stopImmediatePropagation();
      $("fullscreen").click();
    }
  },
  true,
);
for (const panel of [$("board"), $("capture")])
  for (const kind of [
    "mousedown",
    "mouseup",
    "pointerdown",
    "pointerup",
    "wheel",
  ])
    panel.addEventListener(kind, (event) => event.stopPropagation());
document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) {
    captureReady();
    return;
  }
  lastUnlockAt = Date.now();
  if (capturePending) return;
  releaseInput();
  if (
    state.phase === "playing" &&
    state.control === "playing" &&
    document.hasFocus()
  )
    openSettings();
  else if (state.phase === "playing" && state.control !== "settings")
    showCapture();
});
window.addEventListener("blur", () => {
  captureEpoch++;
  capturePending = false;
  releaseInput();
  if (
    state.phase === "playing" &&
    state.control === "playing" &&
    document.hasFocus()
  )
    openSettings();
  else if (state.phase === "playing" && state.control !== "settings")
    showCapture();
});
let pendingScores = [];
function consumeScores(line) {
  line = line.replace("[skipnotify]", "");
  if (line === "ARENA_SCORES_BEGIN") pendingScores = [];
  const m = line.match(/^ARENA_SCORE (\d+) (-?\d+) (-?\d+)/);
  if (m) pendingScores.push({ id: +m[1], score: +m[2], ping: +m[3] });
  if (line === "ARENA_SCORES_END") {
    state.scores = pendingScores;
    renderBoard();
  }
}
function requestScores() {
  if (
    engine &&
    state.phase === "playing" &&
    !respawning &&
    Date.now() - lastScoreAt > 1100
  ) {
    lastScoreAt = Date.now();
    state.command("cmd score");
  }
}
function playerInfo(id) {
  const raw =
    engine?.ccall("Arena_PlayerInfo", "string", ["number"], [id]) || "";
  const parts = raw.replace(/^\\/, "").split("\\");
  const info = {};
  for (let i = 0; i < parts.length; i += 2) info[parts[i]] = parts[i + 1];
  return info;
}
function renderBoard() {
  $("board-rule").textContent =
    `${config.fraglimit || 30} FRAGS · AUTOMATIC MAP ROTATION`;
  $("board-note").textContent =
    `${mapNames[state.stats.map] || "Joining arena"} · ${watch ? "Watching 5 seconds behind live" : "Six bots · Real multiplayer"}`;
  $("respawn").disabled = watch;
  const table = document.createElement("table");
  table.innerHTML =
    '<thead><tr><th class="rk">#</th><th class="nm">PLAYER</th><th>FRAGS</th><th>PING</th></tr></thead>';
  const body = document.createElement("tbody");
  for (const [rank, row] of [...state.scores]
    .sort((a, b) => b.score - a.score)
    .entries()) {
    const info = playerInfo(row.id);
    if (!info.n || info.t === "3") continue;
    const tr = document.createElement("tr");
    if (row.id === state.stats.clientNum) tr.className = "you";
    const pos = document.createElement("td");
    pos.className = "rk";
    pos.textContent = rank + 1;
    const name = document.createElement("td");
    name.className = "nm";
    name.textContent = info.n.replace(/\^[0-9]/g, "");
    const score = document.createElement("td");
    score.className = "num";
    score.textContent = row.score;
    const ping = document.createElement("td");
    ping.className = "num";
    ping.textContent = info.skill ? "BOT" : row.ping;
    tr.append(pos, name, score, ping);
    body.append(tr);
  }
  table.append(body);
  if (body.children.length) $("board-rows").replaceChildren(table);
  else
    $("board-rows").innerHTML = '<div class="empty">Loading standings…</div>';
}
async function start() {
  try {
    document.body.classList.add("in-game");
    state.phase = "loading";
    $("lobby").hidden = true;
    $("game").hidden = false;
    if (configError)
      throw Error("Game server configuration unavailable. Retry to reconnect.");
    $("room-title").textContent =
      roomId === "practice" ? "Bot practice" : "Tournament Arena";
    $("game-mode").textContent = watch
      ? "WATCHING · 5s DELAY"
      : roomId === "practice"
        ? "PRACTICE"
        : "DEATHMATCH";
    if (watch)
      $("game-note").textContent =
        "Watching five seconds behind live. You are not in this match.";
    progress("Preparing engine…", 3);
    const files = await assets();
    progress("Opening game connection…", 80);
    transport = await connect(await getTicket());
    state.phase = "connecting";
    const createEngine = (await import("/engine/ioquake3.js")).default;
    const args = [
      "+set",
      "com_basegame",
      "baseq3",
      "+set",
      "fs_homepath",
      "/home/web",
      "+set",
      "com_hunkMegs",
      "128",
      "+set",
      "com_zoneMegs",
      "32",
      "+set",
      "r_mode",
      "-1",
      "+set",
      "r_customwidth",
      "1280",
      "+set",
      "r_customheight",
      "720",
      "+set",
      "r_fullscreen",
      "0",
      "+set",
      "r_picmip",
      "0",
      "+set",
      "r_textureMode",
      "GL_LINEAR_MIPMAP_LINEAR",
      "+set",
      "r_ext_texture_filter_anisotropic",
      "1",
      "+set",
      "r_ext_max_anisotropy",
      "8",
      "+set",
      "r_dynamiclight",
      "1",
      "+set",
      "r_gamma",
      "1.15",
      "+set",
      "r_lodbias",
      "-1",
      "+set",
      "cg_fov",
      "100",
      "+set",
      "cg_drawFPS",
      "0",
      "+set",
      "cg_drawCrosshair",
      "4",
      "+set",
      "cg_crosshairSize",
      "28",
      "+set",
      "cg_deferPlayers",
      "0",
      "+set",
      "cg_forceModel",
      "1",
      "+set",
      "model",
      "sarge/red",
      "+set",
      "headmodel",
      "sarge/red",
      "+set",
      "cl_allowDownload",
      "0",
      "+set",
      "cl_maxpackets",
      "60",
      "+set",
      "snaps",
      "40",
      "+set",
      "rate",
      "90000",
      "+set",
      "com_maxfps",
      "125",
      "+set",
      "s_volume",
      "0.85",
      "+set",
      "s_musicvolume",
      "0",
      "+set",
      "in_nograb",
      "0",
      "+set",
      "name",
      params
        .get("name")
        ?.replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 20) || "Ranger",
      "+connect",
      "10.0.0.1:27960",
    ];
    const log = (line) => {
      state.events.push(String(line));
      if (state.events.length > 150) state.events.shift();
      consumeScores(String(line));
      if (/^(?:\^\d)*(?:warning|error|failed|couldn.t)\b/i.test(String(line)))
        diagnostics.record("engine", line);
      console.log("[ioq3]", line);
    };
    engine = await createEngine({
      canvas: $("canvas"),
      arguments: args,
      arenaTransport: transport,
      locateFile: (file) => "/engine/" + file,
      print: log,
      printErr: log,
      onAbort: (reason) => fail(Error("Engine stopped: " + reason)),
      preRun: [
        (module) => {
          for (const file of files) {
            module.FS.mkdirTree("/baseq3");
            module.FS.writeFile(file.path, file.data);
          }
          module.FS.mkdirTree("/home/web");
        },
      ],
    });
    progress(
      watch ? "Buffering delayed spectator feed…" : "Joining the match…",
      94,
    );
    applySettings();
    let lastFrame = performance.now(),
      frameCount = engine._Arena_FrameCount(),
      fps = 0;
    let lastMap = "",
      wasIntermission = false;
    let reported = false;
    const began = Date.now();
    setInterval(() => {
      const connection = engine._Arena_State();
      const now = performance.now(),
        count = engine._Arena_FrameCount();
      fps = Math.round(((count - frameCount) * 1000) / (now - lastFrame));
      frameCount = count;
      lastFrame = now;
      state.stats = {
        connection,
        intermission: !!engine._Arena_Intermission(),
        fps,
        serverTime: engine._Arena_ServerTime(),
        sampledAt: Date.now(),
        ping: engine._Arena_Ping(),
        health: engine._Arena_Health(),
        score: engine._Arena_Score(),
        position: [engine._Arena_X(), engine._Arena_Y(), engine._Arena_Z()],
        yaw: engine._Arena_Yaw(),
        pitch: engine._Arena_Pitch(),
        keyCatcher: engine._Arena_KeyCatcher(),
        clientNum: engine._Arena_ClientNum(),
        map: engine.ccall("Arena_Map", "string", [], []),
        entities: JSON.parse(engine.ccall("Arena_Entities", "string", [], [])),
      };
      if (
        state.stats.intermission &&
        !wasIntermission &&
        state.phase === "playing"
      )
        openSettings();
      wasIntermission = state.stats.intermission;
      $("board-status").textContent = state.stats.intermission
        ? "ROUND COMPLETE · NEXT MAP STARTS AUTOMATICALLY"
        : "MATCH CONTINUES WHILE THE MENU IS OPEN";
      $("current-map").textContent =
        mapNames[state.stats.map] || state.stats.map;
      if (state.stats.map !== lastMap) {
        lastMap = state.stats.map;
        state.scores = [];
        applySettings();
        requestScores();
      }
      if (state.control === "playing" && state.stats.keyCatcher)
        engine._Arena_Resume();
      $("metrics").textContent =
        `${fps} FPS · ${watch ? "5s delay" : state.stats.ping + " ms"}`;
      if (reported && connection === 1 && state.phase === "playing") {
        bridge.emit("kicked", { reason: "Game session ended" });
        fail(Error("Game session ended. Reconnect to continue."));
      }
      if (connection === 8 && !reported && state.phase !== "error") {
        reported = true;
        state.phase = "playing";
        $("loading").hidden = true;
        showCapture();
        setTimeout(requestScores, 1200);
        engine._Arena_Resume();
        bridge.emit("ready", {
          online: true,
          roomId,
          mode: roomId === "practice" ? "practice" : "deathmatch",
          watch,
        });
      }
      if (!reported && Date.now() - began > 90000)
        fail(Error("The game did not finish connecting. Please retry."));
    }, 250);
    setInterval(() => {
      if (state.control === "settings") requestScores();
    }, 1800);
  } catch (error) {
    fail(error);
  }
}

if (location.pathname === "/play" || embedded) start();
else {
  renderRooms().catch(roomFailure);
  setInterval(() => renderRooms().catch(roomFailure), 5000);
}
