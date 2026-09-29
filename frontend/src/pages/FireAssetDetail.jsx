import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useTelemetry } from "@/lib/ws";
import {
  ArrowLeft, Droplets, Waves, Gauge, Fuel, Siren, Thermometer, Activity, Zap,
  RotateCw, Clock, Wrench, Flame, Wifi, WifiOff,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const TYPE_META = {
  HYDRANT: { label: "Hydrant", icon: Droplets },
  SPRINKLER_SYSTEM: { label: "Sprinkler System", icon: Waves },
  FIRE_PUMP: { label: "Fire Pump", icon: Gauge },
  FIRE_WATER_TANK: { label: "Fire Water Tank", icon: Fuel },
  HOOTER: { label: "Hooter", icon: Siren },
};

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ATTENTION: "text-amber-700 bg-amber-50 border-amber-200",
  ALARM: "text-red-700 bg-red-50 border-red-200",
  FAULT: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

// Known metrics → label/unit/icon. Unknown keys still render generically.
const METRIC_META = {
  pressure_bar: { label: "Pressure", unit: "bar", icon: Gauge, digits: 2 },
  flow_lpm: { label: "Flow", unit: "L/min", icon: Droplets, digits: 0 },
  motor_temp_c: { label: "Motor Temp", unit: "°C", icon: Thermometer, digits: 1 },
  current_a: { label: "Current", unit: "A", icon: Zap, digits: 1 },
  voltage_v: { label: "Voltage", unit: "V", icon: Zap, digits: 0 },
  rpm: { label: "RPM", unit: "", icon: RotateCw, digits: 0 },
  vibration_mm_s: { label: "Vibration", unit: "mm/s", icon: Activity, digits: 2 },
  runtime_min_today: { label: "Runtime Today", unit: "min", icon: Clock, digits: 0 },
  level_pct: { label: "Tank Level", unit: "%", icon: Fuel, digits: 1 },
  capacity_liters: { label: "Capacity", unit: "L", icon: Fuel, digits: 0 },
  zones_ready: { label: "Zones Ready", unit: "", icon: Waves, digits: 0 },
  zones_total: { label: "Zones Total", unit: "", icon: Waves, digits: 0 },
  running: { label: "Running", unit: "", icon: RotateCw },
  hooter_on: { label: "Hooter", unit: "", icon: Siren },
};

// Metric to chart per asset type
const CHART_METRIC = {
  FIRE_PUMP: "pressure_bar",
  HYDRANT: "pressure_bar",
  SPRINKLER_SYSTEM: "pressure_bar",
  FIRE_WATER_TANK: "level_pct",
};

function fmt(key, v) {
  if (typeof v === "boolean") return v ? "ON" : "OFF";
  if (typeof v === "number") {
    const d = METRIC_META[key]?.digits ?? 2;
    return v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function timeAgo(iso) {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

function healthColor(h) {
  if (h >= 80) return "#22c55e";
  if (h >= 55) return "#f59e0b";
  return "#ef4444";
}

export default function FireAssetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { connected, subscribe } = useTelemetry();
  const [asset, setAsset] = useState(null);
  const [history, setHistory] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [flash, setFlash] = useState({});
  const [error, setError] = useState(null);
  const flashTimers = useRef({});

  async function loadAlarms() {
    try {
      const { data } = await api.get("/fire/alarms", { params: { limit: 200 } });
      setAlarms(data.filter((a) => a.asset_id === id));
    } catch (_) { /* ignore */ }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [a, h, m] = await Promise.all([
          api.get(`/fire/assets/${id}`),
          api.get(`/fire/assets/${id}/history`, { params: { limit: 60 } }),
          api.get(`/fire/assets/${id}/maintenance`),
        ]);
        if (cancelled) return;
        setAsset(a.data);
        setHistory(h.data);
        setMaintenance(m.data);
      } catch (e) {
        if (!cancelled) setError(e.response?.status === 404 ? "Fire asset not found" : "Failed to load asset");
      }
    }
    load();
    loadAlarms();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Live updates from Node-RED via /api/fire/telemetry/ingest
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== "fire_telemetry" || msg.asset_id !== id) return;
      setAsset((prev) => {
        if (!prev) return prev;
        const changed = {};
        Object.keys(msg.metrics || {}).forEach((k) => {
          if (prev.metrics?.[k] !== msg.metrics[k]) changed[k] = true;
        });
        if (Object.keys(changed).length) {
          setFlash((f) => ({ ...f, ...changed }));
          Object.keys(changed).forEach((k) => {
            clearTimeout(flashTimers.current[k]);
            flashTimers.current[k] = setTimeout(() => {
              setFlash((f) => { const c = { ...f }; delete c[k]; return c; });
            }, 900);
          });
        }
        return { ...prev, status: msg.status, health: msg.health, metrics: msg.metrics, last_seen: msg.ts };
      });
      setHistory((h) => [...h.slice(-59), { ts: msg.ts, ...msg.metrics }]);
      if (msg.event) setAlarms((a) => [msg.event, ...a]);
    });
  }, [id, subscribe]);

  useEffect(() => () => Object.values(flashTimers.current).forEach(clearTimeout), []);

  if (error) return <div className="text-slate-500">{error}</div>;
  if (!asset) return <div className="text-slate-500">Loading fire asset…</div>;

  const meta = TYPE_META[asset.asset_type] || TYPE_META.HYDRANT;
  const TypeIcon = meta.icon;
  const metrics = asset.metrics || {};
  const metricKeys = Object.keys(metrics).filter((k) => !k.endsWith("_at") && k !== "duration_sec");
  const chartKey = CHART_METRIC[asset.asset_type];
  const chartData = chartKey
    ? history.filter((r) => typeof r[chartKey] === "number").map((r) => ({
        t: new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        v: r[chartKey],
      }))
    : [];
  const openAlarms = alarms.filter((a) => a.status !== "RESOLVED");
  const h = asset.health ?? 0;

  return (
    <div className="space-y-4" data-testid="fire-asset-detail-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate(-1)}
            className="mt-1 p-1.5 rounded-md border border-slate-200 text-slate-600 hover:border-slate-300"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <TypeIcon className="h-5 w-5 text-[color:var(--brand-navy)]" />
              <h1 className="text-2xl font-display font-bold text-slate-900">{asset.name}</h1>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[asset.status] || STATUS_STYLES.OFFLINE}`}>
                {asset.status}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {asset.asset_code} · {meta.label} · Criticality {asset.criticality} · Last seen {timeAgo(asset.last_seen)}
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-xs ${connected ? "text-emerald-600" : "text-slate-400"}`}>
          {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {connected ? "Live" : "Reconnecting…"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 flex flex-col items-center justify-center">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 self-start">Health Score</div>
          <div className="relative mt-3 h-32 w-32">
            <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none" stroke={healthColor(h)} strokeWidth="3"
                strokeDasharray={`${h} ${100 - h}`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray .6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-3xl font-mono font-bold text-slate-900">{h}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Health</div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {chartKey ? `${METRIC_META[chartKey].label} trend (${METRIC_META[chartKey].unit})` : "Trend"}
          </div>
          <div className="h-44 mt-2">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={40} />
                  <YAxis tick={{ fontSize: 10 }} width={36} domain={["auto", "auto"]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="v" stroke="#1e3a8a" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Waiting for readings…
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metricKeys.map((k) => {
          const mm = METRIC_META[k] || { label: k.replace(/_/g, " "), unit: "", icon: Activity };
          const Icon = mm.icon;
          return (
            <div
              key={k}
              className={`bg-white rounded-lg border p-4 transition-colors duration-300 ${flash[k] ? "border-blue-400 ring-2 ring-blue-200" : "border-[color:var(--border)]"}`}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{mm.label}</div>
                <Icon className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-mono font-bold text-slate-900">
                {fmt(k, metrics[k])} <span className="text-sm font-normal text-slate-500">{mm.unit}</span>
              </div>
            </div>
          );
        })}
        {metricKeys.length === 0 && (
          <div className="col-span-full text-sm text-slate-400">No live metrics yet — start the Node-RED flow.</div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flame className="h-4 w-4 text-red-500" />
            <h2 className="font-semibold text-slate-900">Alarms for this device</h2>
            <span className="ml-auto text-xs text-slate-500">{openAlarms.length} open</span>
          </div>
          {alarms.length === 0 ? (
            <div className="text-sm text-emerald-600">No alarms for this device.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {alarms.slice(0, 8).map((a) => (
                <li key={a.id} className="py-2 flex items-center gap-2 text-sm">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${a.severity === "CRITICAL" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>
                    {a.severity}
                  </span>
                  <span className="text-slate-800 truncate">{a.message || a.event_type}</span>
                  <span className="ml-auto text-xs text-slate-500 shrink-0">{a.status} · {timeAgo(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="h-4 w-4 text-slate-500" />
            <h2 className="font-semibold text-slate-900">Maintenance history</h2>
          </div>
          {maintenance.length === 0 ? (
            <div className="text-sm text-slate-400">No maintenance records.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {maintenance.slice(0, 6).map((m) => (
                <li key={m.id} className="py-2 text-sm flex items-center gap-2">
                  <span className="text-slate-800">{m.description}</span>
                  <span className="text-xs text-slate-500">({m.type})</span>
                  <span className="ml-auto text-xs text-slate-500 shrink-0">
                    {new Date(m.performed_at).toLocaleDateString()} · {m.technician}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
