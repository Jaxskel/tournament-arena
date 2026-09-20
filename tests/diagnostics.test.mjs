import test from "node:test";
import assert from "node:assert/strict";
import { redact, diagnosticReport } from "../web/diagnostics.js";
test("diagnostics strip credentials and URL query strings", () => {
  const line = redact(
    "ticket=private123 Bearer private456 https://example.test/play?token=secret789&name=Player",
  );
  for (const secret of ["private123", "private456", "secret789", "Player"])
    assert.ok(!line.includes(secret));
  assert.ok(line.includes("[redacted]"));
});
test("export whitelists telemetry and bounds diagnostic events", () => {
  const state = {
    phase: "playing",
    control: "playing",
    name: "PrivateName",
    ticket: "PrivateTicket",
    stats: {
      fps: 60,
      ping: 30,
      map: "oa_dm1",
      entities: [{ id: 2, x: 1 }],
      position: [1, 2, 3],
    },
  };
  const transport = {
    ws: { readyState: 1, bufferedAmount: 40 },
    queue: [1],
    metrics: { sentPackets: 12, receivedPackets: 14, secret: "PrivateSecret" },
  };
  const events = Array.from({ length: 100 }, () => ({
    at: "now",
    kind: "error",
    message: "token=privateValue",
  }));
  const r = diagnosticReport(state, transport, events);
  const json = JSON.stringify(r);
  assert.equal(r.events.length, 80);
  assert.equal(r.engine.fps, 60);
  assert.equal(r.transport.sentPackets, 12);
  for (const secret of [
    "PrivateName",
    "PrivateTicket",
    "PrivateSecret",
    "privateValue",
    "entities",
    "position",
  ])
    assert.ok(!json.includes(secret));
});
