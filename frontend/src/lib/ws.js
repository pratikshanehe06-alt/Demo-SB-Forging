import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import { buildWsUrl } from "./api";
import { useAuth } from "./auth";

/**
 * One shared WebSocket for the whole app.
 *
 * Previously every component that called useTelemetryStream() opened its own
 * socket, and only Asset 360 / Operator Runbook actually listened for data —
 * so Node-RED updates never reached the other pages until a manual refresh.
 * Now a single socket lives in <TelemetryProvider>, and any page can either
 * subscribe to raw messages or use useLiveTick() to auto-refetch.
 */
const TelemetryContext = createContext({ connected: false, subscribe: () => () => {} });

export function TelemetryProvider({ children }) {
  const { token } = useAuth();
  const listenersRef = useRef(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    let ws;
    let retryTimer;

    function open() {
      ws = new WebSocket(buildWsUrl(token));
      ws.onopen = () => !cancelled && setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) retryTimer = setTimeout(open, 2000);
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch (_) { return; }
        listenersRef.current.forEach((cb) => {
          try { cb(msg); } catch (e) { console.error("[ws] listener error", e); }
        });
      };
    }
    open();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      try { ws?.close(); } catch (_) {}
    };
  }, [token]);

  // Stable identity so consumers' effects don't re-subscribe every render.
  const subscribe = useCallback((cb) => {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }, []);

  return createElement(TelemetryContext.Provider, { value: { connected, subscribe } }, children);
}

export function useTelemetry() {
  return useContext(TelemetryContext);
}

/** Back-compat: existing callers pass a token; the shared socket already has it. */
export function useTelemetryStream(_token) {
  return useTelemetry();
}

/**
 * Returns a counter that bumps when live data arrives (throttled).
 * Add it to a page's data-loading useEffect deps to auto-refresh:
 *
 *   const liveTick = useLiveTick();
 *   useEffect(() => { load(); }, [liveTick, ...otherDeps]);
 *
 * Also bumps on a fallback interval so pages still refresh if the socket drops.
 */
export function useLiveTick({
  types = ["telemetry", "escalation", "alarm"],
  throttleMs = 5000,
  fallbackMs = 30000,
} = {}) {
  const { connected, subscribe } = useTelemetry();
  const [tick, setTick] = useState(0);
  const lastRef = useRef(0);
  const pendingRef = useRef(null);
  const typesKey = types.join(",");

  useEffect(() => {
    const wanted = new Set(typesKey.split(","));
    const unsub = subscribe((msg) => {
      if (!wanted.has(msg?.type)) return;
      const now = Date.now();
      const wait = throttleMs - (now - lastRef.current);
      if (wait <= 0) {
        lastRef.current = now;
        setTick((t) => t + 1);
      } else if (!pendingRef.current) {
        pendingRef.current = setTimeout(() => {
          pendingRef.current = null;
          lastRef.current = Date.now();
          setTick((t) => t + 1);
        }, wait);
      }
    });
    return () => {
      unsub();
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
    };
  }, [subscribe, typesKey, throttleMs]);

  // Polling fallback only while the socket is down.
  useEffect(() => {
    if (connected || !fallbackMs) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), fallbackMs);
    return () => clearInterval(id);
  }, [connected, fallbackMs]);

  return tick;
}
