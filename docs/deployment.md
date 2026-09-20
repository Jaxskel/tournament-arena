# Running and deployment

## Local process

`npm start` serves the launcher, browser engine, assets and `/ws` on `127.0.0.1:8787`. It starts three native dedicated servers on loopback UDP ports 27960 (Frag Race), 27962 (practice), and 27964 (PPK). SIGINT/SIGTERM shuts down the child servers. Do not expose those UDP ports publicly; all browser admission must pass through the gateway.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP/WS bind address |
| `PORT` | `8787` | HTTP/WS port |
| `ARENA_ALLOWED_ORIGINS` | empty | Comma-separated exact approved host origins |
| `ARENA_RUNTIME` | `runtime/` | Logs, session files, per-room engine homes |
| `ARENA_SERVER_BINARY` | `bin/ioq3ded` | Platform-specific native binary |
| `ARENA_TIMELIMIT` | `15` | Round length in minutes |
| `ARENA_PORT_OFFSET` | `0` | Offset native UDP ports for isolated test servers |
| `ARENA_FRAGLIMIT` | `30` | Demo round score limit; use 3 for faster round tests |

The current `bin/ioq3ded` is built for Apple Silicon macOS. Linux/Windows deployments must rebuild for their platform. The browser output is platform independent.

## Container recipe

```sh
docker compose -f deploy/compose.yml up --build
```

The multi-stage Dockerfile compiles pinned native/WebAssembly builds and copies the license/source downloads into the runtime image. Build context is the project root. It requires internet access and substantial build disk space. The compose port is bound to localhost. Put a TLS reverse proxy in front of it that preserves the Host/Origin headers and supports WebSocket upgrades and long-lived connections. Serve the asset pack with the supplied versioned cache headers; avoid proxy response-size limits below 100 MiB.

The container recipe has not been executed on the delivery machine because its Docker daemon is unavailable. The actual macOS native and Emscripten builds were executed successfully. Validate Linux build/runtime and resource limits on the hosting target before deploying.

A health endpoint returns 200 only while all three rooms are initialized. The server does not automatically restart failed room processes; use a process supervisor or container restart and investigate failures. Persist/rotate runtime logs, monitor CPU/memory and restrict maximum public connections. No live account secrets are required or shipped.

## Share a temporary demo

With the server running:

```sh
cloudflared tunnel --url http://127.0.0.1:8787
```

The printed HTTPS URL supports the browser and WebSockets. A quick tunnel is temporary: the host computer and tunnel process must remain running. It is not a permanent hosted deployment or an availability promise. Stop the tunnel to revoke the public link. The demo has no Tournament accounts or money at stake.

## Source availability

Keep `/credits` and all `/source/` downloads reachable wherever the binaries/media are distributed. The delivery includes full modified engine source, adapter/build/test source and the OpenArena preferred asset source snapshot, plus exact distributed media. Re-run `npm run package:source` after changes before publishing. Preserve dependency and asset notices. Source generation is documented in the README.
