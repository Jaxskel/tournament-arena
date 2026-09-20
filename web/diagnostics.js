const MAX_EVENTS = 80;
export function redact(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"<>]+/gi, (url) => {
      try {
        const u = new URL(url);
        return u.origin + u.pathname + (u.search ? "?[redacted]" : "");
      } catch {
        return "[url]";
      }
    })
    .replace(/\b(Bearer\s+)\S+/gi, "$1[redacted]")
    .replace(
      /\b(token|ticket|authorization|secret|password)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_.-]+/g, "[redacted]")
    .slice(0, 1000);
}
export function diagnosticReport(state, transport, events, server = null) {
  const s = state.stats || {};
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    game: "Tournament",
    phase: state.phase,
    controls: state.control,
    error: redact(state.error),
    captureError: redact(state.captureError),
    assets: state.assets || null,
    engine: Object.fromEntries(
      ["connection", "fps", "ping", "map", "intermission", "keyCatcher"].map(
        (k) => [k, s[k] ?? null],
      ),
    ),
    transport: transport
      ? {
          socketState: transport.ws.readyState,
          queuedPackets: transport.queue.length,
          bufferedBytes: transport.ws.bufferedAmount,
          ...Object.fromEntries(
            [
              "sentPackets",
              "receivedPackets",
              "sentBytes",
              "receivedBytes",
            ].map((k) => [k, transport.metrics?.[k] || 0]),
          ),
        }
      : null,
    server,
    events: events
      .slice(-MAX_EVENTS)
      .map((e) => ({ at: e.at, kind: e.kind, message: redact(e.message) })),
  };
}
export function createDiagnostics(getState, getTransport) {
  const dialog = document.getElementById("diagnostics"),
    events = [];
  let server = null;
  const record = (kind, message) => {
    events.push({
      at: new Date().toISOString(),
      kind,
      message: redact(message),
    });
    if (events.length > MAX_EVENTS) events.shift();
  };
  const report = () => ({
    ...diagnosticReport(getState(), getTransport(), events, server),
    browser: navigator.userAgent,
    pointerLocked: !!document.pointerLockElement,
    online: navigator.onLine,
  });
  function render() {
    const r = report(),
      t = r.transport;
    const values = {
      "Game state": r.phase,
      Mouse: r.pointerLocked ? "Captured" : r.controls,
      "Frame rate": r.engine.fps === null ? "—" : r.engine.fps + " FPS",
      "Game latency": r.engine.ping === null ? "—" : r.engine.ping + " ms",
      Map: r.engine.map || "—",
      WebSocket: t
        ? ["Connecting", "Open", "Closing", "Closed"][t.socketState]
        : "Not connected",
      "Packets received": t?.receivedPackets ?? 0,
      "Packets sent": t?.sentPackets ?? 0,
      "Buffered packets": t?.queuedPackets ?? 0,
      "Asset source": r.assets?.source || "Not loaded",
      "Asset validation": r.assets?.verified
        ? "SHA-256 verified"
        : r.assets?.stage || "Not loaded",
      Server: r.server?.ok ? "Online" : r.server?.error || "Not checked",
    };
    const grid = document.getElementById("diagnostics-summary");
    grid.replaceChildren();
    for (const [label, value] of Object.entries(values)) {
      const cell = document.createElement("div"),
        dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = String(value);
      cell.append(dt, dd);
      grid.append(cell);
    }
    document.getElementById("diagnostics-log").textContent =
      r.events
        .map((e) => `${e.at.slice(11, 19)} [${e.kind}] ${e.message}`)
        .join("\n") || "No errors recorded.";
  }
  async function check() {
    const status = document.getElementById("diagnostics-status");
    status.textContent = "Checking server…";
    try {
      const response = await fetch("/healthz", {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      const health = await response.json();
      server = {
        ok: response.ok && health.ok,
        checkedAt: new Date().toISOString(),
      };
      status.textContent = server.ok
        ? "Game servers are online."
        : "A game server is unavailable. Try reconnecting shortly.";
      record("server", status.textContent);
    } catch (error) {
      server = {
        ok: false,
        error: "Unreachable",
        checkedAt: new Date().toISOString(),
      };
      status.textContent =
        "Cannot reach the server. Check your connection and try again.";
      record("server", error.message);
    }
    render();
  }
  document.getElementById("diagnostics-check").onclick = check;
  document.getElementById("diagnostics-close").onclick = () => dialog.close();
  document.getElementById("diagnostics-reload").onclick = () =>
    location.reload();
  document.getElementById("diagnostics-download").onclick = () => {
    const blob = new Blob([JSON.stringify(report(), null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "tournament-diagnostics-" + Date.now() + ".json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    document.getElementById("diagnostics-status").textContent =
      "Diagnostic report downloaded.";
  };
  window.addEventListener("error", (e) => record("javascript", e.message));
  window.addEventListener("unhandledrejection", (e) =>
    record("promise", e.reason?.message || "Unhandled error"),
  );
  window.addEventListener("offline", () =>
    record("network", "Browser went offline"),
  );
  window.addEventListener("online", () =>
    record("network", "Browser is online"),
  );
  setInterval(() => {
    if (dialog.open) render();
  }, 500);
  return {
    record,
    report,
    isOpen: () => dialog.open,
    open() {
      render();
      dialog.showModal();
      check();
    },
  };
}
