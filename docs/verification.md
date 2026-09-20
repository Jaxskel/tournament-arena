# Verification record

Latest standalone build checked on 2026-09-20 on an Apple M4 Pro running macOS 26.5.2. The native server, patched game QVMs and browser WebAssembly client run the real ioquake3 engine. Generated evidence lives in `docs/evidence/` in the prepared deliverable; it is excluded from Git. All checks below have runnable scripts in `tests/`.

## Frag Race / PPK update

The compact Play/mode menu, native PPK room, configured weapon-value table, two independent PPK players, live weapon-point rankings, Frag Race prize preview, practice isolation and native score tracking pass `npm run test:modes`. PPK runs without a frag limit; cash displays remain demo previews. Tagged native records and rejected client score messages are covered by the source tests. New files: `evidence/modes-results.json`, `evidence/ppk-standings.png`, `evidence/frag-race-standings.png` and `evidence/weapon-values.png`.

The final native build also passed two automatic map transitions with seven participants: both frozen result tables exactly matched Quake's native scoreboard. The connected human and six bots remained throughout. A fresh public HTTPS multiplayer run loaded in 9.08 seconds, sampled 60 FPS five times, and measured 5,023 ms observer lag with no JavaScript errors (`evidence/modes-public-multiplayer.json`). These supplement the earlier baseline below.

## Executed checks

- **Multiplayer:** two isolated Chrome browser contexts join the same native room and see each other in the native scoreboard. Movement, death/respawn, reconnect with a fresh ticket, practice and the optional iframe ticket lifecycle pass.
- **Capacity:** six active human players and six bots share the main room. The seventh human is rejected; a released slot admits a replacement. Practice death/respawn passes. A gateway test independently admits four observers and six humans, rejecting the fifth observer.
- **Menus and actual mouse capture:** agent-browser drives real Chrome through three rapid Escape/Resume cycles. Settings controls keep the pointer released; Debug closes back to settings; Resume captures the pointer and clears native key catchers. Respawn returns to play, focus loss releases input, and settings survive reconnect.
- **Standalone launcher and debugger:** there are no links or requests to the platform website. Debug checks server health, reports verified assets and real packet counters, and downloads a redacted JSON report. A failed room directory recovers through Retry; a failed configuration request exposes an error, retry and Debug controls.
- **Failure handling:** browser tests simulate unavailable and corrupted assets, rejected admission, WebSocket closure, engine disconnect and missing parent tickets. Each produces a recoverable error rather than a false playing state.
- **Spectators:** the local browser run measured 5,025 ms behind live. Gateway buffering is independently timed. Modified observer team, name, role and cheat commands do not grant a playing role or change the server-bound identity.
- **Automated source tests:** all twenty-two Node tests pass, including ticket tampering/expiry/replay, origin and parent checks, actual UDP forwarding, denied remote console commands, observer limits, diagnostic redaction and map/bot bookkeeping. Production dependency audit reports zero known vulnerabilities. Python and shell build-script syntax checks pass.
- **Visible opponents:** the pack retains Sarge's shared Grism textures and packaging rejects unresolved player-skin dependencies. Existing red Sarge models provide contrast. No remastered model set or new commercial media is included.

## Final public and rotation checks

The updated build passed the public HTTPS/WebSocket multiplayer suite on 2026-09-20. Two independent sessions saw each other; movement, death/respawn, reconnect, bot practice, the delayed observer and embedded host lifecycle passed with no JavaScript errors. Initial public join was 14.15 seconds, the observer timeline lag was 4,976 ms, and FPS samples were 56, 64, 56, 64, 56. Evidence: `docs/evidence/public-standalone-multiplayer.json`.

The isolated one-minute round test observed `oa_dm1 → oa_rpg3dm2 → oa_dm1`, retaining one connected human and six bots after both transitions. Only one WebSocket was opened and no ready clicks were used. Evidence: `docs/evidence/rotation-results.json`.

## Browser measurements

| Browser | Version | Local initial join | Five FPS samples |
| --- | --- | --- | --- |
| Google Chrome | 153.0.8010.48 | 1.84 s | 60, 60, 60, 60, 60 |
| Firefox | 146.0.1 | 5.68 s | 121, 118, 120, 119, 119 |
| WebKit | 26.0 | 1.92 s | 53, 60, 63, 59, 63 |

These are short native-engine frame samples on the test desktop, not a sustained performance guarantee. Local initial loading includes fetching the approximately 87 MiB pack over loopback, hashing and engine startup. Internet cold loads depend on connection speed. Spectators wait for the delayed feed.

Chrome uses the installed Google Chrome. Firefox and WebKit use Playwright builds. WebKit results do not certify installed Safari: manual Safari mouse capture, fullscreen and audio remain to be checked. On this Mac, Playwright's Chrome automation sometimes returns `WrongDocumentError` for mouse capture; actual pointer capture passes through the separate agent-browser menu suite. The UI preserves a retryable Play prompt when the browser denies capture.

## Test commands

With the prepared game running on port 8787:

```sh
npm test
npm run test:browser
npm run test:standalone
npm run test:modes
npm run test:capacity
npm run test:faults
npm run test:menus
```

Run capacity tests without other test players occupying the same room. For an isolated automatic-rotation check, start a second server with `PORT=8989 ARENA_PORT_OFFSET=1000 ARENA_RUNTIME=/absolute/test-runtime ARENA_TIMELIMIT=1 ARENA_FRAGLIMIT=0 npm start`, then run `npm run test:rotation`. It observes two map transitions, six bots after each change, one connected human and one WebSocket, without ready clicks.

For public multiplayer use `BROWSERS=chromium ARENA_TEST_URL=https://your-demo-host ARENA_EVIDENCE_FILE=docs/evidence/public-results.json npm run test:browser`. This uses independent browser sessions on the test machine; it does not claim two physical remote computers were tested.

## Remaining deployment and platform work

The quick tunnel requires the host Mac and server to stay running. Permanent hosting, Linux/container execution, long-session load and network-loss testing remain. The Docker daemon on the delivery machine was unavailable, so its deployment recipe is supplied but not certified.

The standalone game uses guest admission and native frag scores. Optional Tournament account, reward, settlement, restriction and anti-cheat services need private staging contracts and verification. They are not connected, and demo play awards no platform rewards. This is working demo coverage, not a claim of complete anti-cheat parity or that every possible browser edge case is bug-free.
