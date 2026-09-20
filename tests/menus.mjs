// Real Chrome pointer capture through agent-browser. Start the local demo first.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const run = promisify(execFile),
  checks = [];
const session = "arena-menu-regression",
  base = process.env.ARENA_TEST_URL || "http://localhost:8787";
async function browser(...args) {
  const { stdout } = await run(
    "npx",
    ["--yes", "agent-browser", "--session", session, "--json", ...args],
    { timeout: 90000, maxBuffer: 4e6 },
  );
  const result = JSON.parse(stdout);
  assert.ok(result.success, JSON.stringify(result));
  return result.data;
}
async function evaluate(code) {
  return (await browser("eval", code)).result;
}
async function wait(code) {
  return browser("wait", "--fn", code);
}
try {
  await browser("open", base + "/play?room=practice&name=MenuTest");
  await wait('window.arena?.phase === "playing"');
  await browser("click", "#capture-button");
  await wait(
    'document.pointerLockElement === document.getElementById("canvas")',
  );
  for (let i = 0; i < 3; i++) {
    await browser("press", "Escape");
    await wait(
      'arena.control === "settings" && !document.getElementById("board").hidden',
    );
    await browser("click", "#resume-button");
    await wait(
      'arena.control === "playing" && document.pointerLockElement === document.getElementById("canvas") && arena.stats.keyCatcher === 0',
    );
  }
  checks.push(
    "three Escape / immediate Resume cycles acquire the pointer and clear native menus",
  );
  await browser("press", "Escape");
  await wait('arena.control === "settings"');
  await browser("click", "#sound-toggle");
  assert.equal(
    await evaluate(
      'document.pointerLockElement === null && arena.control === "settings"',
    ),
    true,
  );
  await browser("click", "#volume");
  assert.equal(
    await evaluate(
      'document.pointerLockElement === null && arena.control === "settings"',
    ),
    true,
  );
  await browser("click", "#sensitivity-reset");
  await wait('document.querySelectorAll("#board-rows tbody tr").length > 0');
  checks.push(
    "settings controls do not capture the mouse; server scoreboard renders player names",
  );
  await browser("click", "#board [data-diagnostics]");
  await wait('document.getElementById("diagnostics").open');
  await browser("press", "Escape");
  await wait(
    '!document.getElementById("diagnostics").open && arena.control === "settings"',
  );
  await browser("click", "#resume-button");
  await wait(
    'document.pointerLockElement === document.getElementById("canvas") && arena.stats.keyCatcher === 0',
  );
  checks.push(
    "Debug Escape returns to settings and Resume recaptures the pointer",
  );
  await browser("press", "Escape");
  await wait('arena.control === "settings"');

  const stored = await evaluate(
    'JSON.parse(localStorage.getItem("arena-controls-v2"))',
  );
  await browser("screenshot", "docs/evidence/tournament-menu.png");
  await browser("click", "#respawn");
  await wait('arena.control === "playing" && arena.stats.health > 0');
  await browser("wait", "1800");
  await wait("arena.stats.health > 0");
  checks.push("menu Respawn returns to gameplay");
  await evaluate(
    'window.dispatchEvent(new Event("blur")); document.exitPointerLock()',
  );
  await wait('arena.control !== "playing"');
  assert.equal(await evaluate("arena.stats.keyCatcher"), 0);
  checks.push("focus loss releases held game input");
  await browser("open", base + "/play?room=practice&name=MenuTest");
  await wait('arena?.phase === "playing"');
  assert.deepEqual(
    await evaluate('JSON.parse(localStorage.getItem("arena-controls-v2"))'),
    stored,
  );
  checks.push("reconnect restores persisted settings");
  const result = {
    url: base,
    ok: true,
    checks,
    stats: await evaluate("arena.stats"),
  };
  await writeFile(
    "docs/evidence/menu-results.json",
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
} finally {
  await browser("close").catch(() => {});
}
