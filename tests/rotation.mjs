// Run against a separate server with ARENA_TIMELIMIT=1 ARENA_FRAGLIMIT=0.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.ARENA_TEST_URL || "http://127.0.0.1:8989";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  let sockets = 0;
  page.on("websocket", () => sockets++);
  await page.goto(base + "/play?room=arena&name=RotationTest");
  await page.waitForFunction(() => arena?.phase === "playing", null, {
    timeout: 60000,
  });
  const botCounts = [];
  const maps = [await page.evaluate(() => arena.stats.map)];
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction(
      (last) =>
        arena.stats.map &&
        arena.stats.map !== last &&
        arena.stats.connection === 8,
      maps.at(-1),
      { timeout: 100000 },
    );
    maps.push(await page.evaluate(() => arena.stats.map));
    await page.waitForFunction(
      async () => {
        const data = await (await fetch("/api/rooms")).json();
        return data.rooms.find((r) => r.id === "arena").bots === 6;
      },
      null,
      { timeout: 20000 },
    );
    const room = (await (await fetch(base + "/api/rooms")).json()).rooms.find(
      (r) => r.id === "arena",
    );
    assert.equal(room.players, 1);
    botCounts.push(room.bots);
  }
  assert.equal(maps[0], maps[2]);
  assert.notEqual(maps[0], maps[1]);
  assert.equal(sockets, 1);
  assert.equal(await page.evaluate(() => arena.phase), "playing");
  const rooms = await fetch(base + "/api/rooms").then((r) => r.json());
  assert.equal(rooms.rooms.find((r) => r.id === "arena").map, maps.at(-1));
  const result = {
    ok: true,
    maps,
    sockets,
    automatic: true,
    botCounts,
    readyClicks: 0,
    stats: await page.evaluate(() => arena.stats),
  };
  console.log(JSON.stringify(result));
  await writeFile(
    "docs/evidence/rotation-results.json",
    JSON.stringify(result, null, 2),
  );
} finally {
  await browser.close();
}
