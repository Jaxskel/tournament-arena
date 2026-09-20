# Frag Race and PPK

The launcher offers **Play → Game mode → Frag Race or PPK**, plus separate bot practice. Six bots remain alongside up to six humans in each room. Automatic maps, settings, Debug and the optional parent-frame adapter remain available.

## Public reference, inspected September 20, 2026

Tournament's public Doom server page calls the modes **Frag Race** and **PPK (points per kill)**. Its client describes 30 kills or 15 minutes for a race, with no per-kill points, and 15-minute PPK maps. The live directory advertised a $6 race prize split $3 / $2 / $1. PPK weapon-point tiers in the public UI are melee/pistol/chainsaw 5, shotgun/super shotgun 4, chaingun 3, rocket 2, plasma/BFG 1. Public displays also describe additional account balance, transfer and eligibility rules; these private platform operations are not reimplemented here.

Reference URLs (documentation only; the game does not navigate to them):
- https://tournament.com/doom2/servers
- https://tournament.com/api/doom2/directory
- https://game.tournament.com/

## Demo policy

`server/modes.mjs` owns the mode and weapon configuration. Browser code only displays it. Native game kill records are hex-encoded and tagged with a private room nonce; arbitrary console/chat text is not accepted as an event. These native records determine the killer, victim and means of death. Player messages cannot submit scores or award currency. Sequence checks reject duplicate ingestion within a running server process; round IDs change on each map and previous results freeze at native round completion.

| Quake weapon | PPK points | Cash preview per kill |
| --- | ---: | ---: |
| Gauntlet | 5 | Unconfigured |
| Shotgun | 4 | $0.10 |
| Machinegun | 3 | Unconfigured |
| Rocket launcher | 2 | Unconfigured |
| Grenade launcher | 2 | Unconfigured |
| Plasma gun | 1 | $0.02 |
| Lightning gun | 1 | Unconfigured |
| Railgun | 4 | Unconfigured |
| BFG | 1 | Unconfigured |

The shotgun and plasma cash examples were requested by the project owner. They are not asserted to be current official Tournament payout rates, and this game has Quake's shotgun rather than Doom's super shotgun. Gauntlet/machinegun use the comparable melee/chaingun tiers; grenade, lightning and railgun tiers are provisional Quake mappings. Unconfigured cash values appear as “—”, never as invented official rates. Displayed PPK cash totals include only configured weapons, while all mapped weapons score points.

**Frag Race:** room `arena`, first to 30 native frags or 15 minutes. The board ranks native frags, then fewer deaths and earlier join order. Positive-score human players in positions 1–3 receive $3 / $2 / $1 **previews**, never a wallet credit. Bots can occupy a podium position but receive no prize preview; they do not promote lower-ranked humans into prizes. Results freeze during intermission and reset on the next map. Native frags deduct suicides/world deaths, which may differ from Doom's pure-kill race rule.

**PPK:** room `ppk`, fifteen minutes with no native frag limit. Ranking uses weapon points, then native frags, fewer deaths and earlier join order. The native weapon cause includes both direct and splash damage. Suicides, world deaths and observer actions award no points or cash previews. Bots score demonstration points but receive no cash preview. Human kills against bots can demonstrate the values. This does not implement the platform's cash transfers, losing-player deductions, fees, entry balance requirements, daily standings or eligibility policy.

**Practice:** room `practice`; no points or prize previews.

The HUD and scoreboard carry mode, clock, live top three, your rank, kills/deaths and points/prize columns. A completed round shows podium results. PPK kills show weapon feedback. All money displays are marked **demo/preview**. There is no cash settlement endpoint or client event that can pay money.

## Transport, lifecycle and production boundary

Authenticated WebSocket sessions receive `type: "match"` snapshots from the server. Observer snapshots and game packets both wait five seconds in the gateway, avoiding a live score side channel. The HTTP directory does not expose live standings. New native slots start at zero; reconnecting as a guest does not preserve an authenticated account's score. Native server restart resets this in-memory demonstration tracker.

Before real payouts: supply authoritative platform policy and Quake weapon mappings, validated account identities, persistence/replay rules, tie and bot eligibility rules, match/round IDs, settlement idempotency, restrictions, anti-cheat ingestion and staging verification. In-process duplicate protection is not a durable reward ledger. `rewards` remains false throughout this delivery.
