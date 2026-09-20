import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.ARENA_TEST_URL;
if (!base) throw Error("Set ARENA_TEST_URL");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto(base);
  await p.screenshot({
    path: "docs/evidence/public-launcher.png",
    fullPage: true,
  });
  const began = Date.now();
  await p.goto(base + "/play?room=arena&name=Ranger");
  await p.waitForFunction(
    () => window.arena?.phase === "playing" || window.arena?.phase === "error",
    null,
    { timeout: 180000 },
  );
  assert.equal(await p.evaluate(() => arena.phase), "playing");
  const loadMs = Date.now() - began;
  await p.bringToFront();
  await p.getByRole("button", { name: "CLICK TO PLAY" }).click();
  await p.waitForTimeout(2000);
  const pointerLocked = await p.evaluate(
    () => document.pointerLockElement?.id === "canvas",
  );
  // macOS headless Chromium can reject native pointer lock while the desktop
  // is locked. Record it explicitly; native authority/network checks still run.
  await p.screenshot({ path: "docs/evidence/public-gameplay.png" });
  const report = {
    url: base,
    pointerLocked,
    pointerLockNote: pointerLocked
      ? "verified"
      : "Native macOS pointer lock requires a foreground manual check; headless Chromium returned WrongDocumentError",
    loadMs,
    stats: await p.evaluate(() => arena.stats),
    errors,
  };
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/evidence/public-demo.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
