import { randomUUID } from "node:crypto";
import { WEAPONS, modeForRoom } from "./modes.mjs";
const infoFields = (raw) => {
  const p = raw.replace(/^\\/, "").split("\\"),
    out = {};
  for (let i = 0; i < p.length; i += 2) out[p[i]] = p[i + 1];
  return out;
};
// Only native server log records enter this tracker. There is no client score API.
export class MatchTracker {
  constructor(room, { now = Date.now, fraglimit, minutes } = {}) {
    this.room = room;
    this.mode = modeForRoom(room);
    this.now = now;
    this.fraglimit = fraglimit ?? this.mode.fraglimit;
    this.minutes = minutes ?? this.mode.minutes;
    this.players = new Map();
    this.sequence = -1;
    this.round = null;
    this.previous = null;
    this.lastKill = null;
  }
  consume(line, sequence) {
    if (!Number.isSafeInteger(sequence) || sequence <= this.sequence) return;
    this.sequence = sequence;
    if (line.startsWith("InitGame:")) {
      if (this.round?.status === "finished")
        this.previous = this.snapshot(false);
      this.players.clear();
      this.lastKill = null;
      this.finalSnapshot = null;
      this.round = {
        id: randomUUID(),
        status: "playing",
        map: line.match(/\\mapname\\([^\\\r\n]+)/)?.[1] || "",
        startedAt: this.now(),
        endsAt: this.now() + this.minutes * 60000,
      };
      return;
    }
    if (!this.round) return;
    let m = line.match(/^ClientConnect: (\d+)\s*$/);
    if (m) {
      this.players.delete(+m[1]);
      return;
    }
    m = line.match(/^ClientUserinfoChanged: (\d+) (.*)$/);
    if (m) {
      const slot = +m[1],
        i = infoFields(m[2]);
      let p = this.players.get(slot);
      if (!p) {
        p = {
          slot,
          name: "Player",
          bot: false,
          observer: false,
          connected: true,
          frags: 0,
          kills: 0,
          deaths: 0,
          points: 0,
          previewCents: 0,
          unpricedKills: 0,
          joinedAt: sequence,
        };
        this.players.set(slot, p);
      }
      p.name = String(i.n || "Player")
        .replace(/\^[0-9]/g, "")
        .slice(0, 40);
      p.bot = "skill" in i;
      p.observer = i.t === "3";
      p.connected = true;
      return;
    }
    m = line.match(/^ClientDisconnect: (\d+)\s*$/);
    if (m) {
      const p = this.players.get(+m[1]);
      if (p) p.connected = false;
      return;
    }
    if (this.round.status === "finished") return;
    m = line.match(/^Kill: (\d+) (\d+) (\d+): /);
    if (m) {
      const attacker = this.players.get(+m[1]),
        victim = this.players.get(+m[2]);
      if (!victim || !victim.connected || victim.observer) return;
      victim.deaths++;
      if (!attacker || attacker === victim) {
        victim.frags--;
        return;
      }
      if (!attacker.connected || attacker.observer) return;
      attacker.kills++;
      attacker.frags++;
      const weapon = WEAPONS.find((w) => w.mods.includes(+m[3]));
      const points = this.mode.id === "perps" ? weapon?.points || 0 : 0;
      const cents =
        this.mode.id === "perps" && !attacker.bot
          ? (weapon?.previewCents ?? 0)
          : 0;
      attacker.points += points;
      attacker.previewCents += cents;
      if (
        this.mode.id === "perps" &&
        !attacker.bot &&
        weapon?.previewCents == null
      )
        attacker.unpricedKills++;
      this.lastKill = {
        id: this.round.id + ":" + sequence,
        attackerSlot: attacker.slot,
        victimSlot: victim.slot,
        weapon: weapon?.name || "Other",
        points,
        previewCents: cents,
        at: this.now(),
      };
      return;
    }
    if (line.startsWith("Exit:")) {
      this.round.status = "finished";
      this.round.finishedAt = this.now();
      this.finalSnapshot = this.snapshot(false);
    }
  }
  snapshot(includePrevious = true) {
    if (!this.round) return null;
    if (this.finalSnapshot)
      return {
        ...this.finalSnapshot,
        ...(includePrevious ? { previous: this.previous } : {}),
      };
    const rows = [...this.players.values()]
      .filter((p) => p.connected && !p.observer)
      .sort(
        (a, b) =>
          (this.mode.id === "perps" ? b.points - a.points : 0) ||
          b.frags - a.frags ||
          a.deaths - b.deaths ||
          a.joinedAt - b.joinedAt,
      )
      .map((p, index) => ({
        ...p,
        rank: index + 1,
        prizePreviewCents:
          this.mode.id === "fragrace" && !p.bot && p.frags > 0
            ? this.mode.prizePreviewCents[index] || 0
            : 0,
      }));
    return {
      ...this.round,
      room: this.room,
      mode: this.mode.id,
      modeName: this.mode.name,
      prizePreviewCents: this.mode.prizePreviewCents,
      serverNow: this.now(),
      remainingMs: Math.max(
        0,
        this.round.endsAt - (this.round.finishedAt || this.now()),
      ),
      fraglimit: this.fraglimit,
      rows,
      lastKill: this.lastKill,
      demo: true,
      rewards: false,
      ...(includePrevious ? { previous: this.previous } : {}),
    };
  }
}
