export function acceptsParent(event, parent, allowed) {
  return (
    event.source === parent &&
    allowed.includes(event.origin) &&
    event.data?.type === "hitplay-token" &&
    typeof event.data.token === "string"
  );
}
export function createBridge({ embedded, allowedOrigins, onEvent = () => {} }) {
  let origin = null;
  try {
    const ref = new URL(document.referrer).origin;
    if (allowedOrigins.includes(ref)) origin = ref;
  } catch {}
  const active = embedded && window.parent !== window;
  function emit(event, extra = {}) {
    onEvent(event, extra);
    if (active && origin)
      window.parent.postMessage({ type: "d2dm", event, ...extra }, origin);
  }
  function ticket(practice = false) {
    if (!active) return Promise.resolve(null);
    if (!origin)
      return Promise.reject(Error("This host is not approved for embedding."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(Error("Tournament did not provide a game ticket."));
      }, 15000);
      function cleanup() {
        clearTimeout(timer);
        window.removeEventListener("message", receive);
      }
      function receive(event) {
        if (!acceptsParent(event, window.parent, [origin])) return;
        cleanup();
        if (!event.data.token)
          reject(Error("Sign in on Tournament to continue."));
        else resolve(event.data.token);
      }
      window.addEventListener("message", receive);
      emit("need-token", { practice });
    });
  }
  return { emit, ticket, active };
}
