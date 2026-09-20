import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.ARENA_TEST_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [],
  errors = [];
await mkdir("docs/evidence", { recursive: true });
try {
  const first = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    p = await first.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(base);
  await p.waitForFunction(() => !document.getElementById("quickplay").disabled);
  await p.locator("#mode-picker").click();
  await p.locator('[data-mode="perps"]').click();
  assert.equal(await p.locator("#selected-mode").textContent(), "PPK");
  await p.locator("#view-rates").click();
  const shotgun = p.locator("#weapon-table tr").filter({ hasText: "Shotgun" }),
    plasma = p.locator("#weapon-table tr").filter({ hasText: "Plasma gun" });
  assert.match(await shotgun.innerText(), /4\s+\$0.10/);
  assert.match(await plasma.innerText(), /1\s+\$0.02/);
  await p.screenshot({ path: "docs/evidence/weapon-values.png" });
  await p.locator("#weapons-close").click();
  await p.locator("#player-name").fill("ModeOne");
  await p.locator("#quickplay").click();
  await p.waitForFunction(
    () => arena.phase === "playing" && arena.match?.mode === "perps",
    null,
    { timeout: 90000 },
  );
  assert.equal(await p.evaluate(() => arena.match.fraglimit), 0);
  assert.equal(await p.evaluate(() => arena.match.rewards), false);
  assert.equal(new URL(p.url()).searchParams.get("room"), "ppk");
  checks.push(
    "mode selector joins native PPK room with no frag limit; plasma 2-cent and shotgun 10-cent demo tiers",
  );
  const second = await browser.newContext(),
    other = await second.newPage();
  await other.goto(base + "/play?room=ppk&name=ModeTwo");
  await other.waitForFunction(
    () =>
      arena.phase === "playing" &&
      arena.match?.rows.some((p) => p.name === "ModeOne"),
    null,
    { timeout: 90000 },
  );
  await p.waitForFunction(() =>
    arena.match?.rows.some((p) => p.name === "ModeTwo"),
  );
  await p.waitForFunction(
    () => arena.match.rows.some((p) => p.points > 0),
    null,
    { timeout: 60000 },
  );
  const match = await p.evaluate(() => arena.match);
  assert.equal(match.rows.filter((p) => p.bot).length, 6);
  const points = match.rows.map((p) => p.points);
  assert.deepEqual(
    points,
    [...points].sort((a, b) => b - a),
  );
  checks.push(
    "two isolated players share six-bot PPK room; native combat updates points and ranking",
  );
  await p.locator("#settings-button").click();
  await p.screenshot({ path: "docs/evidence/ppk-standings.png" });
  assert.match(await p.locator("#board-mode").innerText(), /PPK/);
  assert.match(await p.locator("#board-rows").innerText(), /ModeTwo/);
  await other.close();
  await p.goto(base + "/play?room=arena&name=RaceModeTest");
  await p.waitForFunction(
    () => arena.phase === "playing" && arena.match?.mode === "fragrace",
    null,
    { timeout: 90000 },
  );
  assert.equal(await p.evaluate(() => arena.match.fraglimit), 30);
  await p.locator("#settings-button").click();
  assert.match(
    await p.locator("#board-note").innerText(),
    /\$3\.00 \/ \$2\.00 \/ \$1\.00/,
  );
  await p.screenshot({ path: "docs/evidence/frag-race-standings.png" });
  checks.push(
    "Frag Race uses native 30-frag limit and top-three demo prize display",
  );
  await p.goto(base + "/play?room=practice&name=PracticeModeTest");
  await p.waitForFunction(
    () => arena.phase === "playing" && arena.match?.mode === "practice",
    null,
    { timeout: 90000 },
  );
  assert.ok(
    (await p.evaluate(() => arena.match.rows)).every(
      (r) =>
        r.points === 0 && r.previewCents === 0 && r.prizePreviewCents === 0,
    ),
  );
  checks.push("practice has zero points and zero prize previews");
  assert.deepEqual(errors, []);
  const report = {
    checkedAt: new Date().toISOString(),
    ok: true,
    url: base,
    checks,
    errors,
  };
  await writeFile(
    "docs/evidence/modes-results.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
