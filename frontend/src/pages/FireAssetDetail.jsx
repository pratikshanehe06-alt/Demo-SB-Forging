import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import {
  ArrowLeft, Droplets, Waves, Gauge, Fuel, Siren, Wrench, Clock, MapPin,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const TYPE_META = {
  HYDRANT: { label: "Hydrant", icon: Droplets, metricKey: "pressure_bar", metricUnit: "bar" },
  SPRINKLER_SYSTEM: { label: "Sprinkler System", icon: Waves, metricKey: null, metricUnit: "" },
  FIRE_PUMP: { label: "Fire Pump", icon: Gauge, metricKey: "pressure_bar", metricUnit: "bar" },
  FIRE_WATER_TANK: { label: "Fire Water Tank", icon: Fuel, metricKey: "level_pct", metricUnit: "%" },
  HOOTER: { label: "Hooter", icon: Siren, metricKey: null, metricUnit: "" },
};

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ATTENTION: "text-amber-700 bg-amber-50 border-amber-200",
  ALARM: "text-red-700 bg-red-50 border-red-200",
  FAULT: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status}
    </span>
  );
}

function healthColor(h) {
  if (h >= 80) return "bg-emerald-500";
  if (h >= 55) return "bg-amber-500";
  return "bg-red-500";
}

const MAINT_TYPE_STYLES = {
  PREVENTIVE: "text-blue-700 bg-blue-50 border-blue-200",
  CORRECTIVE: "text-red-700 bg-red-50 border-red-200",
  PREDICTIVE: "text-purple-700 bg-purple-50 border-purple-200",
};

export default function FireAssetDetail() {
  const { id } = useParams();
  const [asset, setAsset] = useState(null);
  const [history, setHistory] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [assetRes, historyRes, maintRes] = await Promise.all([
        api.get(`/fire/assets/${id}`),
        api.get(`/fire/assets/${id}/history`, { params: { limit: 60 } }),
        api.get(`/fire/assets/${id}/maintenance`),
      ]);
      setAsset(assetRes.data);
      setHistory(historyRes.data);
      setMaintenance(maintRes.data);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading || !asset) {
    return (
      <div className="space-y-4" data-testid="fire-asset-detail-page">
        <div className="text-sm text-slate-500">Loading fire asset…</div>
      </div>
    );
  }

  const meta = TYPE_META[asset.asset_type] || TYPE_META.HYDRANT;
  const Icon = meta.icon;
  const chartData = meta.metricKey
    ? history.map((r) => ({
        time: new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        value: r[meta.metricKey],
      }))
    : [];

  return (
    <div className="space-y-4" data-testid="fire-asset-detail-page">
      <Link to="/fire-safety/assets" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Asset Status
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-md bg-slate-50 border border-slate-100 grid place-items-center">
              <Icon className="h-5 w-5 text-[color:var(--brand-navy)]" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-slate-900">{asset.asset_code} — {asset.name}</h1>
              <p className="text-sm text-slate-500">{meta.label} · Criticality: {asset.criticality}</p>
            </div>
          </div>
        </div>
        <StatusPill status={asset.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Health</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className={`h-full rounded-full ${healthColor(asset.health)}`} style={{ width: `${asset.health}%` }} />
            </div>
            <span className="font-mono font-bold text-slate-900">{asset.health}%</span>
          </div>
        </div>

        {meta.metricKey && (
          <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              {meta.metricKey === "pressure_bar" ? "Pressure" : "Level"}
            </div>
            <div className="text-2xl font-mono font-bold text-slate-900">
              {asset.metrics?.[meta.metricKey] ?? "—"} <span className="text-sm text-slate-500">{meta.metricUnit}</span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Last Seen
          </div>
          <div className="text-sm font-medium text-slate-800">
            {asset.last_seen ? new Date(asset.last_seen).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="font-semibold text-sm text-slate-800 mb-3">
            {meta.metricKey === "pressure_bar" ? "Pressure Trend" : "Level Trend"}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 2", "dataMax + 2"]} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#1e3a8a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">Maintenance History</span>
        </div>
        <table className="w-full text-sm" data-testid="fire-asset-maintenance-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Date</th>
              <th className="py-2 px-2 font-semibold">Type</th>
              <th className="py-2 px-2 font-semibold">Description</th>
              <th className="py-2 px-2 font-semibold">Technician</th>
              <th className="py-2 px-2 font-semibold text-right">Cost</th>
              <th className="py-2 px-2 font-semibold">Next Due</th>
            </tr>
          </thead>
          <tbody>
            {maintenance.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2 px-2 text-slate-700">{new Date(m.performed_at).toLocaleDateString()}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${MAINT_TYPE_STYLES[m.type] || MAINT_TYPE_STYLES.PREVENTIVE}`}>{m.type}</span>
                </td>
                <td className="py-2 px-2 text-slate-700">{m.description}</td>
                <td className="py-2 px-2 text-slate-600">{m.technician}</td>
                <td className="py-2 px-2 text-right font-mono">₹{m.cost_inr?.toLocaleString()}</td>
                <td className="py-2 px-2 text-xs text-slate-500">{m.next_due_at ? new Date(m.next_due_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
            {maintenance.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No maintenance records yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
