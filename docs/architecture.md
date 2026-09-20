# Architecture

```
Standalone launcher / optional frame host
        │ exact-origin iframe lifecycle and ticket
        ▼
Browser: ioquake3 WebAssembly + WebGL2
        │ authenticated WebSocket, one binary frame per UDP packet
        ▼
Node HTTP / WS gateway :8787
        │ unique loopback UDP socket per admitted session
        │ private admission file: observer flag, name, session ID
        ▼
ioq3ded :27960 / :27962 / :27964
        │ native authoritative simulation and patched game QVM
        └─ server logs → diagnostic JSONL events (no rewards)
```

## Engine changes

`patches/net_web.c` implements the existing engine's network API over the embedding module's WebSocket queue. The browser sees one fixed virtual destination, `10.0.0.1:27960`; the gateway chooses the actual preconfigured room. Engine exports expose connection state, frame count, server time, health, score and position for diagnostics and UI controls. No JavaScript simulation replaces Quake movement or combat.

`scripts/patch-engine.py` applies browser build wiring, native admission checks in `sv_client.c`, exact source-port handling and revoked-session cleanup in `sv_main.c`, and observer enforcement in `g_client.c`/`g_cmds.c`. Engine admission reasserts identity and observer status on userinfo changes; changing `arena_watch`, name or team cannot grant player status. Closing the WebSocket removes admission and releases the native player slot promptly, without waiting for the UDP timeout. Without `ARENA_SESSION_DIR` the upstream native behavior remains available for development; the supplied launcher always sets it.

## Spectators

The gateway buffers outgoing game state for 5,000 milliseconds on a monotonic clock for watcher tickets. Only `challengeResponse` and `connectResponse` bypass buffering to establish transport; status replies and snapshots are delayed. Input cannot remove the buffer. The game QVM also forces these sessions into spectator mode and rejects team changes. Queue limits disconnect slow clients rather than growing without bound. At startup the watcher waits for the delayed feed; simulated time is behind the live room.

This buffers the game's network stream, not a rendered video stream. Demo watcher control responsiveness is consequently delayed too. A spectator can open another ordinary demo player session because public demo admission is unrestricted; production spectator-only account restrictions must be enforced by Tournament's ticket service.

## Assets and visuals

`prepare-assets.py` merges the official OpenArena packs with deterministic precedence, retains two arenas and the selected player models and their shared Grism skin textures, follows BSP/model/shader texture references, preserves effects and licenses, and inserts the patched upstream game QVMs. `docs/asset-inventory.json` records the original archive SHA-256 and every included asset. Levelshot previews come from the same media. Browser loading verifies the pack's SHA-256 before mounting it and caches it by digest.

The renderer uses full texture detail, trilinear filtering, optional anisotropy, dynamic lights and a modest gamma adjustment. Combat, movement and collisions use the standard Quake III game logic. Full remastered textures/models are outside this first demo.

## Operational limits

One Node process launches three dedicated servers on the same machine. Each room keeps six bots alongside up to six humans. The game QVM checks the fixed bot target every ten seconds, independent of human population. Each native server has sixteen slots: twelve combatants and four delayed observers. Gateway admission separately caps humans at six and observers at four. There is no autoscaling, distributed room allocator, persistent account store, production ticket service or hosted settlement system. Diagnostics append to `runtime/events.jsonl` and room logs; add log rotation for long-running hosting. The gateway's single-use ticket set and signing secret are process-local; restarting invalidates demo tickets. This design is suitable for a demo and a concrete platform adapter starting point, not a claim of production readiness.

## Tournament menu and rotation

The standalone HTML launcher and gold game menu use original local styles and Barlow fonts. There are no links to the Tournament website or account/wallet controls. `Arena_Resume` clears native key catchers and held input; Escape and pointer-lock loss open the HTML menu. An explicit Resume gesture waits through the browser’s short Escape recapture cooldown. Score rows originate in native `CG_ParseScores`, with skip-notify markers so internal messages do not pollute the HUD. Native scoreboards are replaced by the HTML board; intermission opens that board automatically. The gateway sets `g_arenaAutoRotate=1`; the game exits intermission after ten seconds without waiting for ready clicks. Native InitGame announcements drive map metadata and the nextmap command. The engine startup-command limit is raised from 32 to 128 so all configured settings and the final connect/map commands execute.

## Browser diagnostics

Debug is available from the launcher, toolbar and settings menu. It shows verified asset loading/cache status, native FPS and latency, transport packet counters, mouse state and server health. Reports include a bounded event log; identity, chat, tokens, positions and URL query strings are excluded or redacted. Escape closes Debug back to the settings menu; Resume is an explicit capture gesture. Configuration and directory failures show retry controls, and asset requests have bounded timeouts.

## Frag Race and PPK

Mode rules and weapon tiers live in `server/modes.mjs`; `server/match.mjs` tracks native kills, deaths, points and demo prize previews. Native `G_LogPrintf` emits selected event types as hex-encoded records with a private per-room tag. Only authenticated records enter room tracking and scoring; chat and arbitrary console output remain diagnostics. The tag is a private server cvar, not a serverinfo field or browser configuration. Match results freeze on native Exit and reset on InitGame. WebSocket standings snapshots use the same five-second observer queue as game packets. No client score submission or settlement endpoint exists. Detailed rules and provisional Quake mappings: [game-modes.md](game-modes.md).
