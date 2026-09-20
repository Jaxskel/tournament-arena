import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  context = await browser.newContext();
const pages = [],
  report = {};
const base = "http://127.0.0.1:8787";
async function ready(room, name) {
  const p = await context.newPage();
  pages.push(p);
  await p.goto(`${base}/play?room=${room}&name=${name}`);
  await p.waitForFunction(
    () => window.arena?.phase === "playing" || window.arena?.phase === "error",
    null,
    { timeout: 60000 },
  );
  assert.equal(await p.evaluate(() => arena.phase), "playing");
  return p;
}
try {
  for (let i = 1; i <= 6; i++) await ready("atrium", "Capacity" + i);
  await new Promise((r) => setTimeout(r, 1500));
  const log = await readFile("runtime/arena/server.log", "utf8");
  for (let i = 1; i <= 6; i++) {
    const lines = log
      .split("\n")
      .filter(
        (x) =>
          x.includes("ClientUserinfoChanged:") && x.includes(`Capacity${i}\\`),
      );
    assert.match(lines.at(-1), /\\t\\0\\/);
  }
  report.sixActiveHumans = true;
  const room = (await (await fetch(base + "/api/rooms")).json()).rooms.find(
    (r) => r.id === "arena",
  );
  assert.equal(room.players, 6);
  assert.equal(room.bots, 6);
  assert.equal(room.maxCombatants, 12);
  report.sixBotsRemainWithSixHumans = true;
  const seventh = await context.newPage();
  await seventh.goto(base + "/play?room=arena&name=Seventh");
  await seventh.waitForFunction(() => window.arena?.phase === "error", null, {
    timeout: 60000,
  });
  assert.match(await seventh.evaluate(() => arena.error), /ROOM_FULL/);
  report.seventhRejected = true;
  await seventh.close();
  await pages.pop().close();
  const replacement = await ready("atrium", "Replacement");
  await new Promise((r) => setTimeout(r, 1500));
  const next = await readFile("runtime/arena/server.log", "utf8");
  assert.match(
    next
      .split("\n")
      .filter(
        (x) =>
          x.includes("ClientUserinfoChanged:") && x.includes("Replacement\\"),
      )
      .at(-1),
    /\\t\\0\\/,
  );
  report.releasedSlotReused = true;
  for (const p of pages.splice(0)) await p.close();
  const practice = await ready("practice", "PracticeCapacity");
  await practice.waitForTimeout(2400);
  await practice.evaluate(() => arena.command("cmd kill"));
  await practice.waitForFunction(() => arena.stats.health <= 0);
  await practice.waitForTimeout(2400);
  await practice.evaluate(() => arena.command("+attack"));
  await practice.waitForTimeout(200);
  await practice.evaluate(() => arena.command("-attack"));
  await practice.waitForFunction(() => arena.stats.health > 0);
  report.practiceIsPlayable = true;
  console.log(JSON.stringify(report));
  await writeFile(
    "docs/evidence/capacity-results.json",
    JSON.stringify(report, null, 2),
  );
} finally {
  await browser.close();
}
