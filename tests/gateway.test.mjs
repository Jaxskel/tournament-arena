import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import dgram from "node:dgram";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { WebSocket } from "ws";
import {
  makeTicket,
  verifyTicket,
  signTicket,
  allowedOrigin,
  gamePacketDelay,
  attachGateway,
} from "../server/gateway.mjs";
import { acceptsParent } from "../web/bridge.js";
const secret = Buffer.from("unit-test-secret-with-no-production-use");
test("tickets reject tampering, expiration, malformed identities and invalid shapes", () => {
  const token = makeTicket(secret, { room: "atrium", name: "Ranger" });
  assert.equal(verifyTicket(secret, token).room, "atrium");
  assert.throws(() => verifyTicket(secret, token.slice(0, -3) + "xxx"));
  assert.throws(() => verifyTicket(secret, token, Date.now() + 61000));
  assert.throws(() =>
    verifyTicket(
      secret,
      signTicket(secret, { ...verifyTicket(secret, token), name: "bad;quit" }),
    ),
  );
  assert.throws(() => verifyTicket(secret, {}));
  assert.throws(() => verifyTicket(secret, "x"));
});
test("frame bridge requires both exact parent window and allowed origin", () => {
  const parent = {};
  const e = {
    source: parent,
    origin: "https://tournament.com",
    data: { type: "hitplay-token", token: "test" },
  };
  assert.equal(acceptsParent(e, parent, ["https://tournament.com"]), true);
  assert.equal(
    acceptsParent({ ...e, source: {} }, parent, ["https://tournament.com"]),
    false,
  );
  assert.equal(
    acceptsParent(
      { ...e, origin: "https://tournament.com.evil.test" },
      parent,
      ["https://tournament.com"],
    ),
    false,
  );
  assert.equal(allowedOrigin("null", "localhost:8787"), false);
  assert.equal(allowedOrigin("https://evil.test", "localhost:8787"), false);
  assert.equal(allowedOrigin("http://localhost:8787", "localhost:8787"), true);
});
test("spectator game state is delayed, ordinary play and handshake are not", () => {
  const packet = Buffer.from([1, 0, 0, 0, 42]);
  const handshake = Buffer.concat([
    Buffer.from([255, 255, 255, 255]),
    Buffer.from("challengeResponse 42"),
  ]);
  assert.equal(gamePacketDelay(packet, true), 5000);
  assert.equal(gamePacketDelay(packet, false), 0);
  assert.equal(gamePacketDelay(handshake, true), 0);
  const status = Buffer.concat([
    Buffer.from([255, 255, 255, 255]),
    Buffer.from("statusResponse\nscore 10"),
  ]);
  assert.equal(gamePacketDelay(status, true), 5000);
});
async function fixture(t) {
  const sessionDir = await mkdtemp(join(tmpdir(), "arena-test-")),
    udp = dgram.createSocket("udp4");
  udp.bind(0, "127.0.0.1");
  await once(udp, "listening");
  udp.on("message", (data, from) => udp.send(data, from.port, from.address));
  const server = http.createServer();
  const rooms = new Map([
    ["atrium", { ready: true, port: udp.address().port, sessionDir }],
  ]);
  const gateway = attachGateway(server, { rooms, secret, spectatorDelay: 150 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`,
    url = origin.replace("http", "ws") + "/ws";
  t.after(async () => {
    gateway.close();
    server.close();
    udp.close();
    await new Promise((r) => setTimeout(r, 50));
    await rm(sessionDir, { recursive: true, force: true });
  });
  const connect = async (ticket) => {
    const ws = new WebSocket(url, { origin });
    await once(ws, "open");
    const reply = once(ws, "message");
    ws.send(JSON.stringify({ type: "auth", ticket }));
    await reply;
    return ws;
  };
  return { url, origin, connect, gateway, sessionDir };
}
test("gateway authenticates, pins UDP destination, binds identity and rejects reused tickets", async (t) => {
  const f = await fixture(t),
    token = makeTicket(secret, { room: "atrium", name: "Ranger" }),
    ws = await f.connect(token);
  const session = [...f.gateway.sessions][0];
  assert.match(await readFile(session.file, "utf8"), /^0 Ranger /);
  const reply = once(ws, "message"),
    packet = Buffer.from([1, 0, 0, 0, 10, 20]);
  ws.send(packet);
  assert.deepEqual((await reply)[0], packet);
  const second = new WebSocket(f.url, { origin: f.origin });
  await once(second, "open");
  const closed = once(second, "close");
  second.send(JSON.stringify({ type: "auth", ticket: token }));
  assert.equal((await closed)[0], 4401);
  const denied = once(ws, "close");
  ws.send(
    Buffer.concat([
      Buffer.from([255, 255, 255, 255]),
      Buffer.from("rcon bad quit"),
    ]),
  );
  assert.equal((await denied)[0], 4403);
});
test("gateway actually holds spectator packets for the configured duration", async (t) => {
  const f = await fixture(t),
    ws = await f.connect(
      makeTicket(secret, { room: "atrium", name: "Watcher", watch: true }),
    );
  const start = performance.now(),
    reply = once(ws, "message");
  ws.send(Buffer.from([1, 0, 0, 0, 42]));
  await reply;
  assert.ok(performance.now() - start >= 145);
  ws.close();
});
test("unauthenticated binary packets and invalid tickets are rejected", async (t) => {
  const f = await fixture(t);
  for (const payload of [
    Buffer.from([1, 2, 3, 4]),
    JSON.stringify({ type: "auth", ticket: "expired" }),
  ]) {
    const ws = new WebSocket(f.url, { origin: f.origin });
    await once(ws, "open");
    const closed = once(ws, "close");
    ws.send(payload);
    assert.equal((await closed)[0], 4401);
  }
});

test("WebSocket upgrade rejects an unapproved browser origin", async (t) => {
  const f = await fixture(t);
  const ws = new WebSocket(f.url, { origin: "https://unapproved.example" });
  const error = await new Promise((resolve) => ws.once("error", resolve));
  assert.match(error.message, /socket hang up|Unexpected server response/);
});

test("gateway rejects a correctly signed but expired ticket", async (t) => {
  const f = await fixture(t);
  const claims = verifyTicket(
    secret,
    makeTicket(secret, { room: "atrium", name: "Expired" }),
  );
  const ws = new WebSocket(f.url, { origin: f.origin });
  await once(ws, "open");
  const closed = once(ws, "close");
  ws.send(
    JSON.stringify({
      type: "auth",
      ticket: signTicket(secret, { ...claims, exp: Date.now() - 1 }),
    }),
  );
  assert.equal((await closed)[0], 4401);
});

test("observer capacity is independent of six human slots", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 4; i++)
    await f.connect(
      makeTicket(secret, { room: "atrium", name: "Watch" + i, watch: true }),
    );
  const fifth = new WebSocket(f.url, { origin: f.origin });
  await once(fifth, "open");
  const closed = once(fifth, "close");
  fifth.send(
    JSON.stringify({
      type: "auth",
      ticket: makeTicket(secret, {
        room: "atrium",
        name: "Overflow",
        watch: true,
      }),
    }),
  );
  const [code, reason] = await closed;
  assert.equal(code, 4401);
  assert.equal(String(reason), "WATCHERS_FULL");
  for (let i = 0; i < 6; i++)
    await f.connect(makeTicket(secret, { room: "atrium", name: "Player" + i }));
  assert.equal(
    [...f.gateway.sessions].filter((s) => s.claims && !s.claims.watch).length,
    6,
  );
  assert.equal(
    [...f.gateway.sessions].filter((s) => s.claims?.watch).length,
    4,
  );
});
