# Tournament — Arena

A working browser arena shooter: the real ioquake3 engine, OpenArena media, and native authoritative multiplayer. Desktop keyboard and mouse. The game runs independently with a Tournament-branded launcher; demo play carries **no platform points or rewards**.

[GitHub repository](https://github.com/Jaxskel/tournament-arena) · [Demo walkthrough and integration handoff](docs/demo-handoff.md)

## Shareable demo

[Play Tournament Arena](https://prevention-crossing-echo-snowboard.trycloudflare.com/)

This is a temporary HTTPS tunnel to the running demo server. The Mac, server process and tunnel must remain running; it is not permanent hosting. The public site serves `/credits` and full source downloads. [Frame integration preview](https://prevention-crossing-echo-snowboard.trycloudflare.com/host).

## Play locally

The prepared local deliverable includes a WebAssembly client, curated assets, source downloads, and a native **macOS Apple Silicon** dedicated server. A fresh GitHub clone contains source only: follow **Rebuild from source** below before running `npm start`. Generated binaries and large media/source archives are intentionally excluded from Git.

```sh
npm ci
npm start
```

Open <http://127.0.0.1:8787>. Choose **Game mode → Frag Race or PPK**, then **Play**; bot practice is separate. Maps are chosen by the server and rotate automatically. Invite another browser to the same server. WASD moves, mouse aims, left click fires, Space jumps, 1–9 select weapons, Tab shows scores, and Escape opens settings. Click Play to capture the mouse. Escape opens the Tournament menu; Resume returns to play. The menu includes sensitivity, sound, music, volume, respawn and reconnect. Fullscreen is in the game toolbar (or press F).

Each mode has its own room for up to six humans and six bots. The separate practice room also keeps six bots and can also be joined by another demo player. Frag Race ends at 30 frags or 15 minutes; PPK runs for 15 minutes with weapon-based points and no frag limit. After a ten-second intermission, The Atrium and Reactor alternate without a vote or ready-up requirement. Watch mode enforces a five-second delay in the server gateway and prevents joining a player team. The initial media download is about 87 MiB; subsequent visits use verified browser-cached assets.

[Mode rules and weapon table](docs/game-modes.md): Frag Race previews $3 / $2 / $1 for the top three; PPK uses 1–5 weapon points, with the requested plasma $0.02 and shotgun $0.10 demo cash examples. Other weapon cash rates are unconfigured. Native server events determine standings. All money and points are demo previews; there is no wallet or payout system.

The launcher is standalone: the Tournament name, original gold game menus, local fonts and no links or navigation to the platform website. There is no account or wallet system to set up. **Debug** in the launcher, toolbar or settings shows FPS, latency, mouse state, verified assets, packet counters and server health. Download a redacted JSON report when reporting a problem. Escape closes Debug; Resume returns from settings to the game.

This is Quake III-style gameplay powered by ioquake3 and OpenArena, not the Unreal Tournament engine. The optional iframe adapter remains available for future platform integration.

## Rebuild from source

First clone `git@github.com:Jaxskel/tournament-arena.git` and enter that directory.

Prerequisites: Git, curl, Python 3, CMake, Ninja, a native C compiler, Node.js 22+, and Emscripten **6.0.8**. On Linux, install the usual compiler/build packages. Browser builds use upstream SDL through Emscripten; the dedicated server does not need a desktop GPU.

```sh
export EMSDK=/absolute/path/to/emsdk
npm ci
npm run build:engine
python3 scripts/fetch-asset-source.py
npm run package:source
cp LICENSE public/source/LICENSE.txt
cp NOTICE public/source/NOTICE.txt
npm start
```

The build pins ioquake3 to `83a776283bdb958f82db25554b5ed0966aaf6e49`, applies the patches under `patches/` and `scripts/patch-engine.py`, builds both native server and browser client, verifies the original OpenArena 0.8.8 archive, and creates the curated asset pack. Asset ZIP timestamps and file ordering are fixed. Native compiler/toolchain differences may change binaries; this is a reproducible procedure, not a claim of bit-identical cross-platform builds. The media source download is approximately 948 MiB before compression.

`ARENA_BUILD_DIR` changes the build cache directory. `ARENA_BUILD_JOBS` defaults to 4. `ARENA_NATIVE_ONLY=1` builds only the native server and game QVMs. Always rebuild/restart together when changing game QVMs or `arena.pk3`; do not overwrite a pack used by a running server.

## Verify

```sh
npm test
npx playwright install chromium firefox webkit
npm start                         # separate terminal
npm run test:browser
npm run test:faults
npm run test:standalone
npm run test:modes
node tests/capacity.mjs
npm run test:menus               # actual Chrome mouse capture through agent-browser
```

See [verification.md](docs/verification.md) for actual results and limitations. Browser evidence is saved under `docs/evidence`. The automated checks use real engine/server traffic, not a substitute game renderer.

## Deploy and integrate

- [Deployment](docs/deployment.md): process layout, configuration, container recipe, source hosting, and temporary demo links.
- [Tournament contract](docs/integration.md): iframe compatibility, authoritative sessions, production dependencies, and reward gating.
- [Architecture](docs/architecture.md): engine changes, transport, session enforcement, telemetry and spectator delay.
- [Credits and licenses](NOTICE): ioquake3 and OpenArena attribution. The running site's `/credits` page provides complete modified engine, wrapper, and preferred media source downloads.

The original Quake III and Unreal Tournament commercial assets are not included. No custom high-resolution remaster or new model set is claimed: visual improvements use full-resolution OpenArena textures, trilinear/anisotropic filtering, dynamic lighting and consistent player models, preserving gameplay and collisions.

## Visibility and input fixes

The curated pack includes the shared Grism textures referenced by Sarge; every player skin dependency is validated during packaging. Players use the existing red Sarge skin for contrast. No new character models or remastered textures are introduced. The HTML menu owns Escape and releases Quake’s native key catcher and held inputs on resume/focus loss. Capture failures show a retryable Play prompt.

To repeat the rotation check, start a separate server with `PORT=8989 ARENA_PORT_OFFSET=1000 ARENA_RUNTIME=/absolute/path/to/test-runtime ARENA_TIMELIMIT=1 ARENA_FRAGLIMIT=0 npm start`, then run `npm run test:rotation`. It observes two changes without ready clicks and takes about two minutes. Stop that test server afterward.
