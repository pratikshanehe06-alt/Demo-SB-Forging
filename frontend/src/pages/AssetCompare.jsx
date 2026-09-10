import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { StatusPill, HealthPill } from "@/components/Pills";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { Plus, X } from "lucide-react";

const COLORS = ["#1e3a8a", "#ef4444", "#10b981", "#f59e0b"];

export default function AssetComparePage() {
  const [assets, setAssets] = useState([]);
  const [picked, setPicked] = useState([]);
  const [data, setData] = useState([]);

  useEffect(() => { api.get("/assets").then((r) => setAssets(r.data)); }, []);

  useEffect(() => {
    if (picked.length === 0) { setData([]); return; }
    api.get("/apm/compare", { params: { ids: picked.join(",") } }).then((r) => setData(r.data));
  }, [picked]);

  function addAsset(id) {
    if (!id || picked.includes(id) || picked.length >= 4) return;
    setPicked((p) => [...p, id]);
  }
  function removeAsset(id) { setPicked((p) => p.filter((x) => x !== id)); }

  // merge histories by timestamp for overlay chart
  const trend = mergeHistories(data);

  return (
    <div className="space-y-5" data-testid="asset-compare-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Asset Comparison</h1>
        <p className="text-sm text-slate-500">Side-by-side health, reliability and live telemetry — pick up to 4 assets.</p>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value="" onValueChange={addAsset} disabled={picked.length >= 4}>
            <SelectTrigger className="w-72 bg-white h-9" data-testid="compare-asset-picker">
              <SelectValue placeholder="+ Add asset to compare" />
            </SelectTrigger>
            <SelectContent className="bg-white max-h-72">
              {assets.filter((a) => !picked.includes(a.id)).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.asset_code} · {a.asset_type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            {data.map((d, i) => (
              <span key={d.asset_id} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                    style={{ borderColor: COLORS[i], color: COLORS[i] }}>
                <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                {d.asset_code}
                <button onClick={() => removeAsset(d.asset_id)} className="ml-1 text-slate-400 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="ml-auto text-xs text-slate-500">{picked.length}/4 selected</div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-16 text-slate-500 bg-white rounded-lg border border-dashed border-slate-300">
          Pick at least one asset above to see the comparison.
        </div>
      ) : (
        <>
          {/* KPI comparison grid */}
          <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 overflow-x-auto">
            <h3 className="font-display font-semibold text-slate-800 mb-3">APM Metrics</h3>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                  <th className="py-2 px-2 font-semibold">Metric</th>
                  {data.map((d, i) => (
                    <th key={d.asset_id} className="py-2 px-2 font-semibold" style={{ color: COLORS[i] }}>{d.asset_code}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_tr]:border-b [&_tr:last-child]:border-0">
                <Row label="Status">{data.map((d, i) => <td key={i} className="py-2 px-2"><StatusPill status={d.status} /></td>)}</Row>
                <Row label="Health">{data.map((d, i) => <td key={i} className="py-2 px-2"><HealthPill value={d.health} /></td>)}</Row>
                <Row label="Runtime (h)">{data.map((d, i) => <td key={i} className="py-2 px-2 font-mono tabular">{d.runtime_hours}</td>)}</Row>
                <Row label="Failures">{data.map((d, i) => <td key={i} className="py-2 px-2 font-mono tabular">{d.failure_count}</td>)}</Row>
                <Row label="MTBF (h)">{data.map((d, i) => <td key={i} className="py-2 px-2 font-mono tabular">{d.mtbf_hours}</td>)}</Row>
                <Row label="MTTR (h)">{data.map((d, i) => <td key={i} className="py-2 px-2 font-mono tabular">{d.mttr_hours}</td>)}</Row>
                <Row label="Downtime (min)">{data.map((d, i) => <td key={i} className="py-2 px-2 font-mono tabular">{d.downtime_min_total}</td>)}</Row>
                <Row label="Maintenance (YTD)">{data.map((d, i) => <td key={i} className="py-2 px-2 font-mono tabular">₹{d.maintenance_cost_ytd?.toLocaleString?.() || 0}</td>)}</Row>
                <Row label="Location">{data.map((d, i) => <td key={i} className="py-2 px-2 text-slate-600">{d.location || "—"}</td>)}</Row>
              </tbody>
            </table>
          </div>

          {/* Overlay charts */}
          <ChartCard title="Temperature (°C)" dataKey="temperature" trend={trend} data={data} colors={COLORS} />
          <ChartCard title="Vibration (mm/s)" dataKey="vibration" trend={trend} data={data} colors={COLORS} />
          <ChartCard title="Power (kW)" dataKey="power" trend={trend} data={data} colors={COLORS} />
        </>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <tr className="data-row">
      <td className="py-2 px-2 font-semibold text-slate-700 whitespace-nowrap">{label}</td>
      {children}
    </tr>
  );
}

function ChartCard({ title, dataKey, trend, data, colors }) {
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
      <h3 className="font-display font-semibold text-slate-800 mb-3">{title} — trend</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={trend}>
          <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
          <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {data.map((d, i) => (
            <Line key={d.asset_id} type="monotone" dataKey={`${d.asset_code}.${dataKey}`}
              name={d.asset_code} stroke={colors[i]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function mergeHistories(datasets) {
  const bucket = new Map();
  datasets.forEach((d) => {
    (d.history || []).forEach((h) => {
      const t = (h.ts || "").slice(11, 19);
      if (!bucket.has(t)) bucket.set(t, { ts: t });
      const row = bucket.get(t);
      row[`${d.asset_code}.temperature`] = h.temperature;
      row[`${d.asset_code}.vibration`] = h.vibration;
      row[`${d.asset_code}.power`] = h.power;
    });
  });
  return Array.from(bucket.values()).sort((a, b) => a.ts.localeCompare(b.ts));
}
