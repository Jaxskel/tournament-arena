# Optional Tournament integration boundary

The game runs independently with guest admission. The visible launcher has no links to the platform website. This document describes a future integration, not a dependency for playing. No external platform origin is trusted by default.

## Implemented compatibility

The game page supports `/play?embed=1&room=arena&watch=0`. Demo rooms are `arena` and `practice`; legacy `atrium` and `reactor` links resolve to the same rotating `arena` room; `watch=1` requests a delayed observer session. `mode` and `server` may appear in a Tournament URL but are not treated as authority: room configuration controls the game mode and the browser always connects to its own `/ws` gateway. Arbitrary URL-supplied WebSocket or UDP destinations are deliberately not used. Map Tournament room identifiers to approved server configurations during integration.

The iframe bridge emits these messages to the exact approved parent origin:

```js
{ type: 'd2dm', event: 'need-token', practice: false }
{ type: 'd2dm', event: 'ready', online: true, roomId: 'arena', mode: 'deathmatch', watch: false }
{ type: 'd2dm', event: 'kicked', reason: 'Connection closed', code: 1006 }
```

It accepts `{type: 'hitplay-token', token: '...'}` only when `event.source === window.parent` AND the origin is the approved embedding origin. The initial parent is derived from `document.referrer` and compared against same-origin and the explicitly configured parent origins. It never sends a token to `*`. Missing tokens time out after 15 seconds. A host using `Referrer-Policy: no-referrer` needs an explicit approved-origin negotiation before deployment; do not loosen origin checks.

Open `/host` for a working host demonstration. It uses `/api/demo/ticket`, not a fabricated Tournament login or wallet. `/api/doom2/directory` and `/api/doom2/ticket` are observed existing website interfaces, **not endpoints reimplemented by this project**. Reusing the lifecycle does not mean a Doom ticket works against this gateway.

## Server trust

The public prototype issues short-lived HMAC demo admission tickets. They are room-bound, single-use and expire after 60 seconds. They contain a demo session ID, sanitized display name and observer status. These identities are not authenticated Tournament accounts. Each admitted WebSocket gets a private loopback UDP socket; the patched engine obtains identity/observer status from a gateway-owned admission file for that source port, overriding client userinfo. A browser cannot pick a UDP destination or issue remote console commands through the gateway.

Client commands drive input; the native game determines movement, damage, pickups, death, scores and round endings. `sv_pure=1`, disabled downloads/voting/cheats, source-port pinning, packet limits and delayed spectators provide a baseline. This is **not complete anti-cheat**, and browser rendering/input can still be modified. The development `window.arena.command()` hook submits ordinary unprivileged client commands and is not an authority or reward API.

## Required private contracts before production

1. **Game registration and rooms:** a separate Quake game entry within the existing Tournament website. Share its account, preview, login, balance and rewards UI; retain its existing services.
2. **Ticket validation:** authoritative verification/introspection details, audience, issuer, expiry, nonce/replay policy, account ID, room ID, player role, restrictions and revocation. Replace the demo issuer/validator; turn off `/api/demo/ticket` in the production deployment.
3. **Session lifecycle:** bind verified Tournament identities to match participants, reconnect rules and disconnect/kick policy. Demo IDs currently change on reconnect. Store stable match/session identifiers and derive slot-to-account mappings on the server.
4. **Scoring and settlement:** consume authoritative events through the existing pipeline. Add stable match IDs, monotonically ordered event sequence numbers, durable outbox delivery, idempotency keys and settlement acknowledgements. Current JSONL logs are diagnostic evidence, not a settlement ledger. Weapon reward values belong to Tournament game configuration, never the browser.
5. **Anti-cheat ingestion:** define tick/input, movement, weapon, hit, replay and integrity schemas. Implement engine-side capture, replay storage and existing detector ingestion with the platform team. Current server event logs include kills, identities and rounds; they do not implement the private anti-cheat telemetry contract.
6. **Staging sign-off:** verify duplicate/reordered delivery, server crashes, round replay, reconnect identity, account exclusions, forged/expired/revoked tickets, invalid client actions and reward reconciliation. Confirm spectator delay across match transitions and the existing spectator UI.

Keep rewards disabled until all six are complete. No client `postMessage`, HTTP event or submitted score should award points or money. This delivery does not call production settlement, account or anti-cheat endpoints.
