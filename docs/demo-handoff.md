# Tournament Arena — demonstration and integration handoff

This is a separate playable Quake III / OpenArena game with its own standalone Tournament-branded launcher. It has its own native game servers, media and browser client, and uses the Doom-compatible iframe lifecycle. It is not Unreal Tournament.

## Show the multiplayer demo

[Open the demo](https://prevention-crossing-echo-snowboard.trycloudflare.com/).

1. Open that link on two desktop browsers or computers. Enter different player names.
2. Both choose the same **Game mode** (Frag Race or PPK), then press **Play**. Click **CLICK TO PLAY** to capture the mouse.
3. WASD moves, mouse aims, left click shoots, Space jumps, and 1–9 switch weapons.
4. Escape opens the Tournament-style scoreboard/settings. Each player should appear on the other's scoreboard. Click **RESUME GAME** to return.
5. Six bots remain in the match alongside up to six humans. Maps alternate automatically between The Atrium and Reactor. Use **Watch** for a feed delayed by five seconds, or **Bot practice** to warm up.

The first visit downloads approximately 87 MiB. Subsequent visits use verified cached assets. The public link is a temporary tunnel: the host Mac, game server and tunnel must stay running. A permanent game-server deployment is still needed before launch.

## Game modes

Frag Race: first to 30 native frags or 15 minutes, with top-three demo prize previews. PPK: 15-minute rounds, weapon-dependent points and the requested plasma 2¢ / shotgun 10¢ cash previews. Practice: no points. Gold in-game standings show rank, kills/deaths and points or prizes. All cash remains a preview; [full rules](game-modes.md).

## What is ready to demonstrate

- Real native multiplayer authority, up to six human players; weapons, damage, pickups, native scores, deaths and respawns.
- Automatic map rotation, visible textured opponents, mouse capture and working gold settings/scoreboard and a Debug panel with downloadable diagnostics.
- Public HTTPS/WebSocket gameplay and reconnects.
- A working [embedded host preview](https://prevention-crossing-echo-snowboard.trycloudflare.com/host) exercising `need-token`, `hitplay-token`, `ready` and disconnect handling.
- Pinned engine source, reproducible build scripts, media credits and source downloads linked from the demo's Credits page.

## Add it as its own Tournament game

Register a separate Quake game entry using Tournament's existing game-registration mechanism; that private mechanism is not available in this workspace. Serve this game's browser client on an approved game origin and embed `/play?embed=1&room=arena` inside the existing Tournament shell. Room IDs must map to configured Quake servers.

Keep the existing account, login, wallet, points and reward services. The compatibility message type remains `d2dm` to match the observed parent lifecycle; this does not make it a Doom game or make Doom admission tickets valid for Quake.

The remaining platform work needs the Tournament repository or staging contracts for ticket validation, account/room/game binding, settlement, weapon reward configuration, replay/anti-cheat ingestion, restrictions and revocation. The demo's short-lived guest tickets and native frag scores are operational, but **production login, platform rewards and anti-cheat parity are not connected**. Rewards remain disabled. See [integration.md](integration.md) for the precise handoff requirements.

## Unreal Tournament later

The reusable part is the website shell and platform adapter contract. Unreal Tournament needs its own engine/content integration, browser build, native server and telemetry adapter. The current ioquake3 runtime cannot load Unreal Tournament maps or assets. Keep Quake's game registration separate when adding that future title.

## Verification

The public multiplayer check uses two isolated browser sessions on the test Mac, both connecting through the public HTTPS/WebSocket endpoint; it is not a claim that two physical remote computers have been tested. It verifies mutual scoreboard visibility, native movement, death/respawn, reconnect, bot practice, delayed spectating and the iframe lifecycle. Machine-readable results are generated locally under `docs/evidence/` by the test scripts. Broader browser, capacity, rotation and menu checks are in [verification.md](verification.md).
