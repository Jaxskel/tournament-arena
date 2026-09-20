const $ = (id) => document.getElementById(id);
export const dollars = (cents) =>
  cents === null || cents === undefined ? "—" : "$" + (cents / 100).toFixed(2);
export function modeForRoom(policy, room) {
  return (
    policy?.modes?.find((m) => m.room === room) || {
      id:
        room === "ppk"
          ? "perps"
          : room === "practice"
            ? "practice"
            : "fragrace",
      name:
        room === "ppk" ? "PPK" : room === "practice" ? "Practice" : "Frag Race",
      description: "Connecting to the game server…",
    }
  );
}
function el(tag, text, cls) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
export function renderWeaponTable(policy) {
  const table = document.createElement("table");
  table.className = "weapon-table";
  table.innerHTML =
    "<thead><tr><th>WEAPON</th><th>POINTS / KILL</th><th>DEMO $ / KILL</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const w of policy?.weapons || []) {
    const row = document.createElement("tr");
    row.append(
      el("td", w.name),
      el("td", w.points),
      el("td", dollars(w.previewCents)),
    );
    row.title = w.basis;
    body.append(row);
  }
  table.append(body);
  $("weapon-table").replaceChildren(table);
}
let lastKillId = null,
  killTimer;
export function renderMatch(
  match,
  clientNum,
  { watch = false, playing = false, mapName = "" } = {},
) {
  const ppk = match.mode === "perps",
    practice = match.mode === "practice",
    finished = match.status === "finished";
  const prizeSplit = (match.prizePreviewCents || []).map(dollars).join(" / ");
  const me = match.rows.find((r) => r.slot === clientNum);
  const seconds = Math.ceil(match.remainingMs / 1000),
    clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const rule = practice
    ? "BOT PRACTICE · NO POINTS"
    : ppk
      ? "WEAPON POINTS · 1–5 PER KILL"
      : `${match.fraglimit} FRAGS · TOP THREE`;
  $("board-mode").textContent =
    match.modeName.toUpperCase() + (finished ? " · RESULTS" : "");
  $("board-rule").textContent = rule;
  $("board-note").textContent = practice
    ? "Practice scores no points or prize previews."
    : ppk
      ? "DEMO · Weapon points and configured cash previews only."
      : `DEMO PRIZE PREVIEW · ${prizeSplit} · NO REAL PAYOUTS`;
  $("board-status").textContent = finished
    ? "ROUND COMPLETE · NEXT MAP STARTS AUTOMATICALLY"
    : `${mapName} · ${clock} LEFT${watch ? " · WATCHING 5s BEHIND LIVE" : ""}`;
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr><th class="rk">#</th><th class="nm">PLAYER</th><th>K / D</th><th>${ppk ? "POINTS" : "FRAGS"}</th><th>${practice ? "TYPE" : ppk ? "DEMO $*" : "PRIZE PREVIEW"}</th></tr></thead>`;
  const body = document.createElement("tbody");
  for (const row of match.rows) {
    const tr = document.createElement("tr");
    tr.dataset.slot = row.slot;
    if (row.slot === clientNum) tr.classList.add("you");
    if (row.bot) tr.classList.add("bot");
    const rank = el("td", "", "rk");
    rank.append(
      el(
        "span",
        row.rank,
        row.rank <= 3 ? "medal medal-" + row.rank : "rank-number",
      ),
    );
    const name = el("td", row.name, "nm");
    if (row.bot) name.append(el("small", " BOT", "player-tag"));
    else if (row.slot === clientNum)
      name.append(el("small", " YOU", "player-tag"));
    const amount = practice
      ? row.bot
        ? "BOT"
        : "PLAYER"
      : row.bot
        ? "—"
        : dollars(ppk ? row.previewCents : row.prizePreviewCents);
    tr.append(
      rank,
      name,
      el("td", `${row.kills} / ${row.deaths}`, "num"),
      el("td", ppk ? row.points : row.frags, "num"),
      el("td", amount, "num reward-value"),
    );
    body.append(tr);
  }
  table.append(body);
  const previousScroll = $("board-rows").scrollTop;
  $("board-rows").replaceChildren(
    match.rows.length ? table : el("div", "Waiting for players…", "empty"),
  );
  $("board-rows").scrollTop = previousScroll;
  const podium = $("board-podium");
  podium.hidden = !finished || practice;
  podium.replaceChildren();
  if (!podium.hidden)
    for (const row of match.rows.slice(0, 3)) {
      const card = el("div", "", "podium-place");
      card.append(
        el("small", `${row.rank}${["ST", "ND", "RD"][row.rank - 1]}`),
        el("strong", row.name),
        el(
          "span",
          row.bot
            ? "BOT · NO PRIZE"
            : ppk
              ? `${row.points} PTS`
              : `${dollars(row.prizePreviewCents)} PREVIEW`,
        ),
      );
      podium.append(card);
    }
  $("match-hud").hidden = !playing;
  $("hud-mode").textContent = match.modeName.toUpperCase();
  $("hud-clock").textContent = finished ? "RESULTS" : clock;
  $("hud-rule").textContent = rule;
  $("hud-leaders").replaceChildren(
    ...match.rows.slice(0, 3).map((row) => {
      const li = el("li", "");
      li.append(
        el("span", `${row.rank}. ${row.name}${row.bot ? " [BOT]" : ""}`),
        el("strong", ppk ? `${row.points} PTS` : row.frags),
      );
      return li;
    }),
  );
  $("hud-personal").textContent = watch
    ? "WATCHING · 5s DELAY"
    : me
      ? `YOU #${me.rank} · ${ppk ? me.points + " PTS" : me.frags + " FRAGS"}${ppk ? " · " + dollars(me.previewCents) + " preview" : ""}`
      : "Joining standings…";
  $("hud-demo").textContent = practice
    ? "PRACTICE · NO POINTS"
    : ppk
      ? "* ONLY CONFIGURED CASH RATES · DEMO"
      : `TOP 3: ${prizeSplit} PREVIEW · DEMO`;
  const kill = match.lastKill;
  if (kill && kill.id !== lastKillId) {
    lastKillId = kill.id;
    if (
      ppk &&
      playing &&
      me &&
      !me.bot &&
      !watch &&
      kill.attackerSlot === clientNum &&
      match.serverNow - kill.at < 3000
    ) {
      const popup = $("kill-reward");
      popup.textContent = `+${kill.points} PTS · ${kill.weapon}${kill.previewCents ? " · " + dollars(kill.previewCents) + " DEMO" : ""}`;
      popup.hidden = false;
      clearTimeout(killTimer);
      killTimer = setTimeout(() => (popup.hidden = true), 2200);
    }
  }
}
