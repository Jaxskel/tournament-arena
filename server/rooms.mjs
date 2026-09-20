export const MAPS = [
  { id: "oa_dm1", name: "The Atrium" },
  { id: "oa_rpg3dm2", name: "Reactor" },
];
export function canonicalRoom(id) {
  return ["atrium", "reactor", "arena", undefined, null, ""].includes(id)
    ? "arena"
    : id;
}
export function nextMap(map) {
  const index = MAPS.findIndex((m) => m.id === map);
  return MAPS[(index + 1) % MAPS.length].id;
}
export function mapName(map) {
  return MAPS.find((m) => m.id === map)?.name || map;
}
export function parseStartedMap(line) {
  const map = line.match(/\\mapname\\([^\\\r\n]+)/)?.[1];
  return MAPS.some((m) => m.id === map) ? map : null;
}

// Slot numbers are reused across maps and sessions. Track only current playing
// bots so a stale slot cannot inflate the directory or evict a human on join.
export function trackBotSlots(room, line) {
  if (line.includes("InitGame:")) room.botSlots.clear();
  const identity = line.match(/ClientUserinfoChanged: (\d+) (.*)/);
  if (identity) {
    const slot = Number(identity[1]);
    const observer = /\\t\\3(?:\\|$)/.test(identity[2]);
    if (identity[2].includes("\\skill\\") && !observer) room.botSlots.add(slot);
    else room.botSlots.delete(slot);
  }
  const disconnected = line.match(/ClientDisconnect: (\d+)/);
  if (disconnected) room.botSlots.delete(Number(disconnected[1]));
}
