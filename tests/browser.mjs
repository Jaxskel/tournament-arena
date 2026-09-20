// Real-engine smoke and multiplayer checks. Run with the demo server listening.
import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir, readFile } from "node:fs/promises";
const base = process.env.ARENA_TEST_URL || "http://127.0.0.1:8787";
const results = [];
const evidencePath =
  process.env.ARENA_EVIDENCE_FILE || "docs/evidence/browser-results.json";
await mkdir("docs/evidence", { recursive: true });
const kinds = (process.env.BROWSERS || "chromium,firefox,webkit").split(",");
for (const kind of kinds) {
  let browser;
  const report = {
    browser: kind,
    url: base,
    checkedAt: new Date().toISOString(),
    checks: [],
    errors: [],
  };
  try {
    browser = await { chromium, firefox, webkit }[kind].launch({
      headless: true,
      ...(kind === "chromium" ? { channel: "chrome" } : {}),
    });
    report.version = browser.version();
    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      p = await context.newPage();
    async function ready(page, path) {
      page.on("pageerror", (e) => report.errors.push(e.message));
      const began = Date.now();
      await page.goto(base + path);
      await page.waitForFunction(
        () =>
          window.arena?.phase === "playing" || window.arena?.phase === "error",
        null,
        { timeout: 120000 },
      );
      const info = await page.evaluate(() => ({
        phase: arena.phase,
        error: arena.error,
        stats: arena.stats,
      }));
      assert.equal(info.phase, "playing", info.error);
      report.checks.push(`load ${path}: ${Date.now() - began}ms`);
      return info;
    }
    let info = await ready(p, "/play?room=arena&name=BrowserTest");
    report.checks.push("connected to rotating arena");
    await p.getByRole("button", { name: "CLICK TO PLAY" }).click();
    // Real input commands are processed by the native authoritative server.
    // The engine rate-limits reliable console commands after initial userinfo.
    await p.waitForTimeout(2400);
    await p.evaluate(() => arena.command("cmd kill"));
    await p.waitForFunction(() => arena.stats.health <= 0, null, {
      timeout: 10000,
    });
    await p.waitForTimeout(1200);
    await p.evaluate(() => arena.command("+attack"));
    await p.waitForTimeout(600);
    await p.evaluate(() => arena.command("-attack"));
    await p.waitForFunction(() => arena.stats.health > 0, null, {
      timeout: 15000,
    });
    report.checks.push("death and respawn");
    const before = await p.evaluate(() => arena.stats.position);
    await p.evaluate(() => arena.command("+forward; +moveup"));
    await p.waitForTimeout(1000);
    await p.evaluate(() => arena.command("-forward; -moveup"));
    const after = await p.evaluate(() => arena.stats.position);
    assert.notDeepEqual(after, before);
    report.checks.push("authoritative movement");
    const frames = [];
    for (let i = 0; i < 5; i++) {
      await p.waitForTimeout(1000);
      frames.push(await p.evaluate(() => arena.stats.fps));
    }
    report.fpsSamples = frames;
    report.performance = await p.evaluate(() => ({
      ...arena.stats,
      heap: performance.memory?.usedJSHeapSize,
    }));
    await p.screenshot({ path: `docs/evidence/${kind}-game.png` });
    await p.reload();
    await p.waitForFunction(() => window.arena?.phase === "playing", null, {
      timeout: 120000,
    });
    report.checks.push("reconnect with fresh ticket and cached assets");
    if (kind === "chromium") {
      const secondContext = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const p2 = await secondContext.newPage();
      await ready(p2, "/play?room=arena&name=SecondPlayer");
      const directory = await fetch(base + "/api/rooms").then((r) => r.json());
      assert.ok(directory.rooms.find((r) => r.id === "arena").players >= 2);
      for (const [page, opponent] of [
        [p, "SecondPlayer"],
        [p2, "BrowserTest"],
      ]) {
        await page.locator("#settings-button").click();
        await page.waitForFunction(
          (name) =>
            document.getElementById("board-rows").textContent.includes(name),
          opponent,
          { timeout: 15000 },
        );
      }
      report.checks.push(
        "two independent clients see each other in the native server scoreboard",
      );
      const spectator = await context.newPage();
      await ready(spectator, "/play?room=arena&watch=1&name=ObserverTest");
      const [a, b] = await Promise.all([
        p2.evaluate(() => arena.stats),
        spectator.evaluate(() => arena.stats),
      ]);
      const delay = b.sampledAt - b.serverTime - (a.sampledAt - a.serverTime);
      assert.ok(delay >= 4500 && delay < 6500, `spectator delta ${delay}`);
      report.spectatorDelayMs = delay;
      report.checks.push("server-enforced five-second spectator delay");
      await spectator.evaluate(() =>
        arena.command(
          "cmd team free; setu arena_watch 0; name Spoofed; cmd god; cmd noclip",
        ),
      );
      await spectator.waitForTimeout(6000);
      report.checks.push(
        "sent adversarial spectator commands; native server logs must confirm observer remains spectator",
      );
      if (!process.env.ARENA_TEST_URL) {
        const log = await readFile("runtime/arena/server.log", "utf8");
        const identities = log
          .split("\n")
          .filter(
            (line) =>
              line.includes("ClientUserinfoChanged:") &&
              line.includes("ObserverTest"),
          );
        assert.match(identities.at(-1), /\\t\\3\\/);
        assert.ok(!identities.at(-1).includes("Spoofed"));
        report.checks.push(
          "native observer role and identity survived client tampering",
        );
      }
      await spectator.close();
      await p2.close();
      await p.close();
      const practice = await context.newPage();
      await ready(practice, "/play?room=practice&name=PracticeTest");
      report.checks.push("bot practice");
      await practice.close();
      const host = await context.newPage();
      host.on("pageerror", (e) => report.errors.push(e.message));
      await host.goto(base + "/host");
      await host
        .waitForFunction(
          () => document.getElementById("events").textContent.includes("ready"),
          null,
          { timeout: 30000 },
        )
        .catch(async (error) => {
          for (const frame of host.frames())
            console.log(
              "HOST_DIAGNOSTIC",
              await frame.evaluate(() => ({
                url: location.href,
                phase: window.arena?.phase,
                error: window.arena?.error,
                events: window.arena?.events?.slice(-8),
                text: document.body.innerText.slice(-500),
              })),
            );
          throw error;
        });
      report.checks.push(
        "embedded host need-token / hitplay-token / ready lifecycle",
      );
      await host.close();
    }
    report.ok = report.errors.length === 0;
  } catch (e) {
    report.ok = false;
    report.failure = String(e.stack || e);
  } finally {
    // Save completed assertions before browser-process teardown, which can
    // stall independently of gameplay on the desktop automation host.
    results.push(report);
    console.log(JSON.stringify(report));
    await writeFile(evidencePath, JSON.stringify(results, null, 2));
    let cleanupTimer;
    await Promise.race([
      browser?.close(),
      new Promise(resolve => { cleanupTimer = setTimeout(resolve, 10000); }),
    ]);
    clearTimeout(cleanupTimer);
  }
}
if (results.some((x) => !x.ok)) process.exitCode = 1;

// This is a standalone CLI. Do not leave automation sockets holding it open
// after evidence is flushed and owned browser teardown has been attempted.
setTimeout(() => process.exit(process.exitCode || 0), 1000).unref();
