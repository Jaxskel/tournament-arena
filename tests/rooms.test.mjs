import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalRoom,
  nextMap,
  parseStartedMap,
  trackBotSlots,
} from "../server/rooms.mjs";
test("old map links join one rotating room; practice stays separate", () => {
  for (const id of [undefined, "", "atrium", "reactor", "arena"])
    assert.equal(canonicalRoom(id), "arena");
  assert.equal(canonicalRoom("practice"), "practice");
  assert.equal(canonicalRoom("unconfigured"), "unconfigured");
});
test("native map announcements drive the alternating rotation", () => {
  const first = parseStartedMap("InitGame: \\mapname\\oa_dm1\\g_gametype\\0");
  assert.equal(first, "oa_dm1");
  assert.equal(nextMap(first), "oa_rpg3dm2");
  assert.equal(nextMap(nextMap(first)), first);
  assert.equal(
    parseStartedMap("InitGame: \\mapname\\unconfigured\\g_gametype\\0"),
    null,
  );
  assert.equal(parseStartedMap("ClientUserinfoChanged: 1 name=mapname"), null);
});

test("bot slots reset across rounds and cannot evict reused human slots", () => {
  const room = { botSlots: new Set([0, 4, 7]) };
  trackBotSlots(room, "InitGame: \\mapname\\oa_rpg3dm2");
  assert.equal(room.botSlots.size, 0);
  trackBotSlots(room, "ClientUserinfoChanged: 0 n\\Sarge\\t\\0\\skill\\2");
  assert.deepEqual([...room.botSlots], [0]);
  trackBotSlots(room, "ClientUserinfoChanged: 0 n\\Human\\t\\0\\model\\sarge");
  assert.equal(room.botSlots.size, 0);
  trackBotSlots(
    room,
    "ClientUserinfoChanged: 2 n\\BotObserver\\t\\3\\skill\\2",
  );
  assert.equal(room.botSlots.size, 0);
  trackBotSlots(room, "ClientUserinfoChanged: 3 n\\Grunt\\t\\0\\skill\\2");
  trackBotSlots(room, "ClientDisconnect: 3");
  assert.equal(room.botSlots.size, 0);
});
