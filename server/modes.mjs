// Demo policy. Production amounts and eligibility must come from Tournament.
export const WEAPONS = [
  {
    id: "gauntlet",
    name: "Gauntlet",
    points: 5,
    previewCents: null,
    mods: [2],
    basis: "Melee tier",
  },
  {
    id: "machinegun",
    name: "Machinegun",
    points: 3,
    previewCents: null,
    mods: [3],
    basis: "Chaingun tier",
  },
  {
    id: "shotgun",
    name: "Shotgun",
    points: 4,
    previewCents: 10,
    mods: [1],
    basis: "Shotgun tier; requested 10-cent example",
  },
  {
    id: "grenade",
    name: "Grenade launcher",
    points: 2,
    previewCents: null,
    mods: [4, 5],
    basis: "Proposed explosive tier",
  },
  {
    id: "rocket",
    name: "Rocket launcher",
    points: 2,
    previewCents: null,
    mods: [6, 7],
    basis: "Rocket tier",
  },
  {
    id: "lightning",
    name: "Lightning gun",
    points: 1,
    previewCents: null,
    mods: [11],
    basis: "Proposed energy tier",
  },
  {
    id: "railgun",
    name: "Railgun",
    points: 4,
    previewCents: null,
    mods: [10],
    basis: "Proposed precision tier",
  },
  {
    id: "plasma",
    name: "Plasma gun",
    points: 1,
    previewCents: 2,
    mods: [8, 9],
    basis: "Plasma tier; requested 2-cent example",
  },
  {
    id: "bfg",
    name: "BFG",
    points: 1,
    previewCents: null,
    mods: [12, 13],
    basis: "BFG tier",
  },
];
export const MODES = {
  fragrace: {
    id: "fragrace",
    name: "Frag Race",
    room: "arena",
    fraglimit: 30,
    minutes: 15,
    prizePreviewCents: [300, 200, 100],
    description: "Race to 30 frags. Top three places share the prize preview.",
  },
  perps: {
    id: "perps",
    name: "PPK",
    room: "ppk",
    fraglimit: 0,
    minutes: 15,
    prizePreviewCents: [],
    description: "Points per kill. Weapon choice determines your score.",
  },
  practice: {
    id: "practice",
    name: "Practice",
    room: "practice",
    fraglimit: 30,
    minutes: 15,
    prizePreviewCents: [],
    description: "Warm up with six bots. No points or prize previews.",
  },
};
export const modeForRoom = (room) =>
  MODES[
    room === "ppk" ? "perps" : room === "practice" ? "practice" : "fragrace"
  ];
export function publicPolicy() {
  return {
    version: "demo-2026-09-20",
    demo: true,
    rewards: false,
    currency: "USD",
    modes: Object.values(MODES),
    weapons: WEAPONS.map(({ mods, ...w }) => w),
    note: "Demo only. No real money, wallet balance or platform points. Other weapon cash rates are unconfigured.",
  };
}
