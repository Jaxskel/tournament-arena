import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = process.env.ARENA_TEST_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const checks = [],
  requests = [];
await mkdir("docs/evidence", { recursive: true });
try {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  p.on("request", (r) => requests.push(r.url()));
  await p.goto(base);
  await p.waitForFunction(() => !document.getElementById("quickplay").disabled);
  assert.equal(await p.locator('a[href*="tournament.com"]').count(), 0);
  assert.equal(await p.getByText("Sign in", { exact: true }).count(), 0);
  assert.equal(await p.locator("#selected-mode").textContent(), "FRAG RACE");
  await p.getByRole("button", { name: "Debug", exact: true }).first().click();
  await p.waitForFunction(() =>
    document
      .getElementById("diagnostics-status")
      .textContent.includes("online"),
  );
  assert.ok(await p.locator("#diagnostics").isVisible());
  await p.keyboard.press("Escape");
  assert.equal(await p.locator("#diagnostics").isVisible(), false);
  checks.push("standalone launcher and diagnostic health check");
  await p.screenshot({
    path: "docs/evidence/standalone-lobby-full.png",
    fullPage: true,
  });
  await p.getByRole("button", { name: "BOT PRACTICE", exact: true }).click();
  await p.waitForFunction(() => window.arena?.phase === "playing", null, {
    timeout: 60000,
  });
  await p.locator(".arena-toolbar [data-diagnostics]").click();
  await p.waitForFunction(
    () => arena.diagnostics().transport?.receivedPackets > 5,
  );
  const report = await p.evaluate(() => arena.diagnostics());
  assert.equal(report.assets.verified, true);
  assert.equal(report.transport.socketState, 1);
  assert.ok(report.transport.sentPackets > 0);
  assert.equal("position" in report.engine, false);
  await p.screenshot({ path: "docs/evidence/standalone-debug.png" });
  const downloadPromise = p.waitForEvent("download");
  await p.locator("#diagnostics-download").click();
  const download = await downloadPromise;
  const data = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(data.game, "Tournament");
  assert.equal(data.assets.verified, true);
  assert.equal(
    data.events.some((e) => /ticket=eyJ|token=eyJ|[?&]name=/.test(e.message)),
    false,
  );
  await p.keyboard.press("Escape");
  assert.equal(await p.locator("#diagnostics").isVisible(), false);
  assert.equal(await p.evaluate(() => arena.control), "settings");
  assert.equal(await p.locator("#board").isVisible(), true);
  checks.push(
    "in-game diagnostics, verified assets, real packet counters, report download and Escape back to settings",
  );
  assert.equal(
    requests.some((url) => /^https?:\/\/([^/]+\.)?tournament\.com\//.test(url)),
    false,
  );
  checks.push("no links or network requests to platform website");
  await p.close();
  const failure = await browser.newPage();
  await failure.route("**/api/rooms", (r) =>
    r.fulfill({ status: 503, body: "Unavailable" }),
  );
  await failure.goto(base);
  await failure.waitForSelector("#server-error");
  assert.equal(await failure.locator("#quickplay").isDisabled(), true);
  await failure.unroute("**/api/rooms");
  await failure.locator("#retry-server").click();
  await failure.waitForFunction(
    () => document.getElementById("server-error").hidden,
  );
  assert.equal(await failure.locator("#quickplay").isEnabled(), true);
  checks.push("directory failure displays retry and recovers");
  await failure.route("**/api/config", (r) =>
    r.fulfill({ status: 503, body: "Unavailable" }),
  );
  await failure.goto(base + "/play?room=practice");
  await failure.waitForFunction(() => arena.phase === "error");
  assert.match(
    await failure.evaluate(() => arena.error),
    /configuration unavailable/,
  );
  assert.ok(
    (await failure.evaluate(() => arena.diagnostics())).events.some(
      (e) => e.kind === "configuration" && e.message.includes("503"),
    ),
  );
  assert.equal(await failure.locator("#retry").isVisible(), true);
  await failure.locator(".arena-toolbar [data-diagnostics]").click();
  assert.equal(await failure.locator("#diagnostics").isVisible(), true);
  checks.push("configuration failure exposes recoverable error and Debug");
  const result = {
    checkedAt: new Date().toISOString(),
    url: base,
    ok: true,
    checks,
  };
  await writeFile(
    "docs/evidence/standalone-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
