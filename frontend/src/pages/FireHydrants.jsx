import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Droplets, TrendingUp, AlertTriangle,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ATTENTION: "text-amber-700 bg-amber-50 border-amber-200",
  ALARM: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status}
    </span>
  );
}

function PressureGauge({ value, warning, critical }) {
  const max = Math.max(warning * 1.3, value * 1.1, 10);
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const color = value <= critical ? "#ef4444" : value <= warning ? "#f59e0b" : "#10b981";
  return (
    <div>
      <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden relative">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>0</span>
        <span>Warn {warning}</span>
        <span>{max.toFixed(0)} bar</span>
      </div>
    </div>
  );
}

function HydrantCard({ hydrant, history }) {
  const chartData = history.map((h) => ({
    time: new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    pressure: h.pressure_bar,
  }));

  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4" data-testid={`hydrant-card-${hydrant.name}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Droplets className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">{hydrant.name}</span>
        </div>
        <StatusPill status={hydrant.status} />
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className="text-3xl font-mono font-bold text-slate-900">{hydrant.pressure_bar ?? "—"}</span>
        <span className="text-sm text-slate-500">bar</span>
        {hydrant.pressure_bar !== null && hydrant.pressure_bar < hydrant.critical_threshold && (
          <span className="ml-2 flex items-center gap-1 text-xs text-red-600 font-medium">
            <AlertTriangle className="h-3 w-3" /> Below critical
          </span>
        )}
      </div>

      <PressureGauge value={hydrant.pressure_bar || 0} warning={hydrant.warning_threshold} critical={hydrant.critical_threshold} />

      {chartData.length > 1 && (
        <div className="mt-4 h-32">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Pressure trend
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <ReferenceLine y={hydrant.warning_threshold} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine y={hydrant.critical_threshold} stroke="#ef4444" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="pressure" stroke="#1e3a8a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-2 text-[10px] text-slate-400">
        Last seen {hydrant.last_seen ? new Date(hydrant.last_seen).toLocaleString() : "—"}
      </div>
    </div>
  );
}

export default function FireHydrants() {
  const [hydrants, setHydrants] = useState([]);
  const [histories, setHistories] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await api.get("/fire/hydrants");
      setHydrants(data);
      const historyEntries = await Promise.all(
        data.map((h) => api.get(`/fire/hydrants/${h.id}/history`, { params: { limit: 40 } }).then((r) => [h.id, r.data]))
      );
      setHistories(Object.fromEntries(historyEntries));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4" data-testid="fire-hydrants-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Hydrant System</h1>
        <div className="text-sm text-slate-500">Loading hydrant data…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="fire-hydrants-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Hydrant System</h1>
        <p className="text-sm text-slate-500">Live pressure monitoring with warning and critical thresholds.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {hydrants.map((h) => (
          <HydrantCard key={h.id} hydrant={h} history={histories[h.id] || []} />
        ))}
        {hydrants.length === 0 && <div className="text-sm text-slate-400 col-span-full">No hydrants configured.</div>}
      </div>
    </div>
  );
}
