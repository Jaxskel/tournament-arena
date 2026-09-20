import test from "node:test";
import assert from "node:assert/strict";
import { MatchTracker } from "../server/match.mjs";
import { publicPolicy } from "../server/modes.mjs";
function fixture(room = "ppk") {
  let sequence = 0,
    now = 1000;
  const tracker = new MatchTracker(room, { now: () => now });
  const send = (line) => tracker.consume(line, ++sequence);
  send("InitGame: \\mapname\\oa_dm1\\");
  const player = (slot, name, bot = false) => {
    send(`ClientConnect: ${slot}`);
    send(
      `ClientUserinfoChanged: ${slot} n\\${name}\\t\\0${bot ? "\\skill\\2" : ""}`,
    );
  };
  player(0, "Alpha");
  player(1, "Beta");
  player(2, "Bot", true);
  return {
    tracker,
    send,
    player,
    advance: (ms) => (now += ms),
    get sequence() {
      return sequence;
    },
  };
}
test("native weapon causes determine PPK tiers and configured cent previews", () => {
  const f = fixture();
  f.send("Kill: 0 1 8: Alpha killed Beta by MOD_PLASMA");
  f.send("Kill: 0 1 9: Alpha killed Beta by MOD_PLASMA_SPLASH");
  f.send("Kill: 0 1 1: Alpha killed Beta by MOD_SHOTGUN");
  f.send("Kill: 0 1 6: Alpha killed Beta by MOD_ROCKET");
  const p = f.tracker.snapshot().rows.find((r) => r.slot === 0);
  assert.equal(p.points, 8);
  assert.equal(p.previewCents, 14);
  assert.equal(p.unpricedKills, 1);
  assert.equal(p.frags, 4);
  assert.equal(f.tracker.snapshot().rewards, false);
});
test("suicides, world deaths, observers, disconnected players and chat cannot award points", () => {
  const f = fixture();
  f.send("Kill: 0 0 20: suicide");
  f.send("Kill: 1022 1 16: world");
  f.send("say: Alpha: Kill: 0 1 1: forged");
  f.send("ClientUserinfoChanged: 0 n\\Alpha\\t\\3");
  f.send("Kill: 0 1 1: invalid observer");
  f.send("ClientDisconnect: 0");
  f.send("Kill: 0 1 1: disconnected");
  assert.equal(
    [...f.tracker.players.values()].reduce((n, p) => n + p.points, 0),
    0,
  );
  assert.equal(f.tracker.players.get(0).frags, -1);
});
test("server event sequence rejects duplicate ingestion, slots never inherit old scores", () => {
  const f = fixture();
  const line = "Kill: 0 1 1: shotgun";
  f.send(line);
  f.tracker.consume(line, f.sequence);
  assert.equal(f.tracker.players.get(0).points, 4);
  f.send("ClientDisconnect: 0");
  f.player(0, "Replacement");
  assert.equal(f.tracker.players.get(0).points, 0);
  assert.equal(f.tracker.players.get(0).previewCents, 0);
});
test("PPK ranks points above raw frags; bots have no cash previews", () => {
  const f = fixture();
  f.send("Kill: 0 1 1: shotgun");
  f.send("Kill: 1 0 8: plasma");
  f.send("Kill: 1 0 8: plasma");
  f.send("Kill: 2 0 1: bot shotgun");
  const rows = f.tracker.snapshot().rows;
  assert.ok(
    rows.findIndex((p) => p.name === "Alpha") <
      rows.findIndex((p) => p.name === "Beta"),
  );
  assert.equal(rows.find((p) => p.bot).previewCents, 0);
});
test("Frag Race ranks frags, previews top-three prizes, freezes results and resets rounds", () => {
  const f = fixture("arena");
  f.player(3, "Gamma");
  for (let i = 0; i < 3; i++) f.send("Kill: 0 2 1: shotgun");
  for (let i = 0; i < 2; i++) f.send("Kill: 1 2 8: plasma");
  f.send("Kill: 3 2 3: machinegun");
  let match = f.tracker.snapshot();
  assert.deepEqual(
    match.rows.slice(0, 3).map((p) => p.prizePreviewCents),
    [300, 200, 100],
  );
  assert.equal(match.rows[0].points, 0);
  f.send("Exit: Fraglimit hit.");
  const finished = f.tracker.snapshot();
  f.send("ClientDisconnect: 0");
  f.send("Kill: 1 2 1: late kill");
  assert.deepEqual(f.tracker.snapshot().rows, finished.rows);
  f.advance(10000);
  f.send("InitGame: \\mapname\\oa_rpg3dm2\\");
  f.player(0, "Alpha");
  match = f.tracker.snapshot();
  assert.notEqual(match.id, finished.id);
  assert.equal(match.previous.id, finished.id);
  assert.equal(match.rows[0].frags, 0);
  assert.equal(match.previous.status, "finished");
});
test("practice and unconfigured values cannot create rewards", () => {
  const f = fixture("practice");
  f.send("Kill: 0 1 1: shotgun");
  const p = f.tracker.snapshot().rows[0];
  assert.equal(p.points, 0);
  assert.equal(p.previewCents, 0);
  assert.equal(p.prizePreviewCents, 0);
  const policy = publicPolicy();
  assert.equal(policy.rewards, false);
  assert.equal(
    policy.weapons.find((w) => w.id === "railgun").previewCents,
    null,
  );
});

test("only native records with the private room tag reach the score parser", async () => {
  const { decodeNativeRecord } = await import("../server/native-record.mjs");
  const nonce = "test-private-nonce",
    body = "Kill: 0 1 1: Native event\n";
  assert.equal(decodeNativeRecord(body, nonce), null);
  assert.equal(
    decodeNativeRecord(
      "ARENA_RECORD wrong " + Buffer.from(body).toString("hex"),
      nonce,
    ),
    null,
  );
  assert.equal(
    decodeNativeRecord(
      "ARENA_RECORD " + nonce + " " + Buffer.from(body).toString("hex"),
      nonce,
    ),
    body.trim(),
  );
  assert.equal(
    decodeNativeRecord("ARENA_RECORD " + nonce + " xyz", nonce),
    null,
  );
  assert.equal(
    decodeNativeRecord(
      "ARENA_RECORD " +
        nonce +
        " " +
        Buffer.from(
          "ClientUserinfoChanged: 0 n\\X\nKill: 0 1 1: injected",
        ).toString("hex"),
      nonce,
    ).includes("\n"),
    false,
  );
});
