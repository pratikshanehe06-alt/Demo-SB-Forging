import { useEffect, useRef, useState } from "react";
import { buildWsUrl } from "./api";

export function useTelemetryStream(token) {
  const wsRef = useRef(null);
  const listenersRef = useRef(new Set());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    function open() {
      const ws = new WebSocket(buildWsUrl(token));
      wsRef.current = ws;
      ws.onopen = () => !cancelled && setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) setTimeout(open, 2000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          listenersRef.current.forEach((cb) => cb(msg));
        } catch (_) {}
      };
    }
    open();

    return () => {
      cancelled = true;
      try {
        wsRef.current?.close();
      } catch (_) {}
    };
  }, [token]);

  function subscribe(cb) {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }

  return { connected, subscribe };
}
