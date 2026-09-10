import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTelemetryStream } from "@/lib/ws";
import { StatusPill } from "@/components/Pills";
import MaintenancePanel from "@/components/MaintenancePanel";
import {
  Thermometer, Activity, Zap, Gauge as GaugeIcon, Power, Battery,
  Factory, ArrowLeft, Wifi, WifiOff, RotateCw, MapPin, Droplet,
  Clock, AlertTriangle, TrendingUp, Wrench
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { motion, AnimatePresence } from "framer-motion";

export default function Asset360() {
  const { id } = useParams();
  const { token } = useAuth();
  const [asset, setAsset] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [tele, setTele] = useState({});
  const [history, setHistory] = useState([]);
  const [flash, setFlash] = useState({});
  const flashTimersRef = useRef({});
  const { connected, subscribe } = useTelemetryStream(token);

  useEffect(() => {
    async function load() {
      const [{ data: a }, { data: t }, { data: h }, { data: m }] = await Promise.all([
        api.get(`/assets/${id}`),
        api.get(`/assets/${id}/telemetry/latest`),
        api.get(`/assets/${id}/telemetry/history`, { params: { limit: 60 } }),
        api.get(`/assets/${id}/metrics`),
      ]);
      setAsset(a);
      setTele(t || {});
      setHistory(h);
      setMetrics(m);
    }
    load();
  }, [id]);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== "telemetry" || msg.asset_id !== id) return;
      setAsset((a) => a ? { ...a, status: msg.status, health: msg.health } : a);
      setTele((prev) => {
        const next = { ...prev, ...msg.data };
        const changed = {};
        Object.keys(msg.data).forEach((k) => {
          if (prev[k] !== msg.data[k]) changed[k] = true;
        });
        setFlash((f) => ({ ...f, ...changed }));
        Object.keys(changed).forEach((k) => {
          if (flashTimersRef.current[k]) clearTimeout(flashTimersRef.current[k]);
          flashTimersRef.current[k] = setTimeout(() => {
            setFlash((f) => { const c = { ...f }; delete c[k]; return c; });
          }, 900);
        });
        return next;
      });
      setHistory((h) => {
        const point = { ts: msg.data.ts, temperature: msg.data.temperature, vibration: msg.data.vibration, rpm: msg.data.rpm, power: msg.data.power };
        return [...h.slice(-59), point];
      });
    });
  }, [id, subscribe]);

  if (!asset) return <div className="text-slate-500">Loading asset…</div>;

  const cards = [
    { key: "temperature", label: "Temperature", unit: "°C", icon: Thermometer, color: "text-red-600" },
    { key: "vibration", label: "Vibration", unit: "mm/s", icon: Activity, color: "text-amber-600" },
    { key: "pressure", label: "Pressure", unit: "bar", icon: GaugeIcon, color: "text-blue-600" },
    { key: "rpm", label: "RPM", unit: "", icon: RotateCw, color: "text-purple-600" },
    { key: "flow", label: "Flow", unit: "l/min", icon: Droplet, color: "text-cyan-600" },
    { key: "voltage", label: "Voltage", unit: "V", icon: Zap, color: "text-yellow-600" },
    { key: "current", label: "Current", unit: "A", icon: Zap, color: "text-orange-600" },
    { key: "power", label: "Power", unit: "kW", icon: Power, color: "text-emerald-600" },
    { key: "energy", label: "Energy", unit: "kWh", icon: Battery, color: "text-teal-600" },
  ];

  const trendData = history.map((h) => ({
    ts: h.ts?.slice(11, 19) || "",
    temperature: h.temperature, vibration: h.vibration, rpm: h.rpm, power: h.power,
  }));

  return (
    <div className="space-y-5" data-testid="asset-360-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/assets" className="text-slate-500 hover:text-slate-800"><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-display font-bold text-slate-900">{asset.asset_code}</h1>
              <StatusPill status={asset.status} />
            </div>
            <p className="text-sm text-slate-500">{asset.name} · {asset.asset_type} · {asset.area_name} · {asset.plant_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold"><Wifi className="h-3.5 w-3.5" /> Live</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-500 font-semibold"><WifiOff className="h-3.5 w-3.5" /> Offline</span>
          )}
        </div>
      </div>

      {/* Top row: health + digital twin representation */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Health Score</div>
          <div className="mt-3 relative w-32 h-32 mx-auto">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={asset.health >= 80 ? "#22c55e" : asset.health >= 60 ? "#f59e0b" : "#ef4444"}
                strokeWidth="10" strokeDasharray={`${(asset.health / 100) * 264} 264`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-3xl font-mono font-bold">{asset.health}</div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Health</div>
              </div>
            </div>
          </div>
          <div className="mt-2 text-center text-xs text-slate-500">Criticality · {asset.criticality}</div>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Digital Twin</div>
            <StatusPill status={asset.status} />
          </div>
          <div className="mt-4 h-40 rounded-md bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 relative overflow-hidden grid place-items-center">
            <motion.div
              animate={asset.status === "RUNNING" ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: asset.status === "RUNNING" ? Math.max(1, 5 - (Number(tele.rpm) || 0) / 500) : 0, repeat: Infinity, ease: "linear" }}
              className="text-[color:var(--brand-navy)]"
            >
              <Factory className="h-16 w-16" strokeWidth={1.4} />
            </motion.div>
            {asset.status === "CRITICAL" && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-red-600 text-white text-[10px] font-bold uppercase animate-pulse">Critical</div>
            )}
            {asset.status === "WARNING" && (
              <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase animate-pulse">Warning</div>
            )}
            <div className="absolute bottom-2 left-3 font-mono text-xs text-slate-600">
              RPM <span className="tabular font-bold">{Number(tele.rpm || 0).toFixed(0)}</span>
            </div>
            <div className="absolute bottom-2 right-3 font-mono text-xs text-slate-600">
              <span className="tabular font-bold">{Number(tele.temperature || 0).toFixed(1)}</span> °C
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Production</div>
          <div className="mt-3 space-y-2 text-sm">
            <ProdRow label="Total" value={tele.production_count ?? 0} color="text-slate-900" />
            <ProdRow label="Good" value={tele.good_count ?? 0} color="text-emerald-700" />
            <ProdRow label="Reject" value={tele.reject_count ?? 0} color="text-red-700" />
            <ProdRow label="Yield" value={`${tele.production_count ? Math.round(((tele.good_count || 0) * 100) / tele.production_count) : 0}%`} color="text-blue-700" />
          </div>
        </div>
      </div>

      {/* Telemetry cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.key} data-testid={`telem-${c.key}`} className={`bg-white rounded-lg border border-[color:var(--border)] p-4 ${flash[c.key] ? "telemetry-flash" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</span>
              <c.icon className={`h-4 w-4 ${c.color}`} />
            </div>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={String(tele[c.key])}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-2xl font-mono font-bold tabular text-slate-900"
              >
                {tele[c.key] !== undefined && tele[c.key] !== null ? Number(tele[c.key]).toFixed(c.key === "rpm" || c.key === "production_count" ? 0 : 2) : "--"}
                <span className="text-sm font-medium text-slate-500 ml-1">{c.unit}</span>
              </motion.div>
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* APM metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="apm-metrics">
        <ApmStat label="Runtime" value={metrics?.runtime_hours ?? 0} unit="h" icon={Clock} color="text-slate-700" />
        <ApmStat label="Failures" value={metrics?.failure_count ?? 0} icon={AlertTriangle} color="text-red-600" />
        <ApmStat label="MTBF" value={metrics?.mtbf_hours ?? 0} unit="h" icon={TrendingUp} color="text-emerald-700" />
        <ApmStat label="MTTR" value={metrics?.mttr_hours ?? 0} unit="h" icon={Wrench} color="text-amber-700" />
        <ApmStat label="Downtime" value={metrics?.downtime_min_total ?? 0} unit="min" icon={Clock} color="text-orange-700" />
        <ApmStat label="Maint. Cost YTD" value={`₹${(metrics?.maintenance_cost_ytd || 0).toLocaleString()}`} icon={Wrench} color="text-blue-700" />
      </div>

      {/* Trend chart */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-slate-800">Live Telemetry Trend</h3>
          <span className="text-xs text-slate-500">Last {trendData.length} samples</span>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trendData}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
            <XAxis dataKey="ts" tick={{ fontSize: 10, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
            <Line type="monotone" dataKey="temperature" stroke="#ef4444" strokeWidth={2} dot={false} name="Temp °C" />
            <Line type="monotone" dataKey="vibration" stroke="#f59e0b" strokeWidth={2} dot={false} name="Vibration" />
            <Line type="monotone" dataKey="power" stroke="#10b981" strokeWidth={2} dot={false} name="Power kW" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Metadata */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Meta label="Asset ID" value={asset.asset_code} />
        <Meta label="Type" value={asset.asset_type} />
        <Meta label="Manufacturer" value={asset.manufacturer || "—"} />
        <Meta label="Model" value={asset.model || "—"} />
        <Meta label="Serial" value={asset.serial || "—"} />
        <Meta label="Installation" value={asset.installation_date || "—"} />
        <Meta label="Last Seen" value={asset.last_seen ? new Date(asset.last_seen).toLocaleString() : "—"} />
        <Meta label="Criticality" value={asset.criticality} />
        <div className="md:col-span-4 flex items-center gap-2 pt-2 border-t">
          <MapPin className="h-4 w-4 text-slate-500" />
          <span className="text-slate-700 font-medium">{asset.location || `${asset.plant_name} · ${asset.area_name}`}</span>
        </div>
      </div>

      <MaintenancePanel assetId={asset.id} />
    </div>
  );
}

function ApmStat({ label, value, unit, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 font-mono font-bold text-xl tabular text-slate-900">
        {value}{unit && <span className="text-xs font-medium text-slate-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</div>
      <div className="mt-0.5 text-slate-800 font-medium">{value}</div>
    </div>
  );
}

function ProdRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
