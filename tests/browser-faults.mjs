import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.ARENA_TEST_URL || "http://127.0.0.1:8787";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const fault of [
    "missing-pack",
    "corrupt-pack",
    "expired-ticket",
    "room-mismatch",
  ]) {
    const page = await browser.newPage();
    if (fault === "missing-pack")
      await page.route("**/assets/arena.pk3?*", (r) =>
        r.fulfill({ status: 503, body: "unavailable" }),
      );
    if (fault === "corrupt-pack")
      await page.route("**/assets/arena.pk3?*", (r) =>
        r.fulfill({ status: 200, body: "corrupt" }),
      );
    if (fault === "expired-ticket")
      await page.route("**/api/demo/ticket", (r) =>
        r.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ticket: "expired.invalid" }),
        }),
      );
    if (fault === "room-mismatch")
      await page.route("**/api/demo/ticket", async (route) => {
        const response = await route.fetch({
          postData: JSON.stringify({ room: "ppk", name: "Mismatch" }),
        });
        await route.fulfill({ response });
      });
    await page.goto(base + "/play?room=atrium&name=FaultTest");
    await page.waitForFunction(() => window.arena?.phase === "error", null, {
      timeout: 60000,
    });
    const error = await page.evaluate(() => arena.error);
    assert.match(
      error,
      fault === "missing-pack"
        ? /downloaded/
        : fault === "corrupt-pack"
          ? /verification failed/
          : fault === "room-mismatch"
            ? /does not match/
            : /INVALID_TICKET/,
    );
    assert.ok(
      await page.getByRole("button", { name: "Try again" }).isVisible(),
    );
    results.push({ fault, error, ok: true });
    await page.close();
  }
  const page = await browser.newPage();
  let serverSocket, clientSocket;
  await page.routeWebSocket("**/ws", (ws) => {
    clientSocket = ws;
    serverSocket = ws.connectToServer();
  });
  await page.goto(base + "/play?room=atrium&name=DisconnectTest");
  await page.waitForFunction(() => window.arena?.phase === "playing", null, {
    timeout: 60000,
  });
  serverSocket.close({ code: 1011, reason: "Test disconnect" });
  clientSocket.close({ code: 1011, reason: "Test disconnect" });
  await page.waitForFunction(() => arena.phase === "error");
  assert.match(await page.evaluate(() => arena.error), /disconnect/i);
  results.push({ fault: "transport-disconnect", ok: true });
  await page.reload();
  await page.waitForFunction(() => arena.phase === "playing", null, {
    timeout: 60000,
  });
  await page.evaluate(() => arena.command("disconnect"));
  await page.waitForFunction(() => arena.phase === "error");
  assert.match(await page.evaluate(() => arena.error), /Game session ended/);
  results.push({ fault: "engine-disconnect", ok: true });
  const host = await browser.newPage();
  await host.route("**/api/demo/ticket", (r) =>
    r.fulfill({ status: 401, contentType: "application/json", body: "{}" }),
  );
  await host.goto(base + "/host");
  const child = host.frames().find((f) => f.parentFrame());
  await child.waitForFunction(() => window.arena?.phase === "error", null, {
    timeout: 60000,
  });
  assert.match(await child.evaluate(() => arena.error), /Sign in/);
  results.push({ fault: "missing-parent-ticket", ok: true });
  console.log(JSON.stringify(results));
  await writeFile(
    "docs/evidence/browser-faults.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  await browser.close();
}
