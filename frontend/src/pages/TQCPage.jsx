import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ClipboardCheck, AlertTriangle, Leaf, Factory } from "lucide-react";

const STATUS_STYLES = {
  PASS: "text-emerald-700 bg-emerald-50 border-emerald-200",
  HOLD: "text-amber-700 bg-amber-50 border-amber-200",
  FAIL: "text-red-700 bg-red-50 border-red-200",
};

function KpiCard({ icon: Icon, label, value, color = "text-[color:var(--brand-navy)]" }) {
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 text-2xl font-mono font-bold tabular text-slate-900">{value}</div>
    </div>
  );
}

export default function TQCPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/tqc/summary", { params: { days: 14 } }).then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4" data-testid="tqc-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">TQC — Traceability, Quality & Carbon</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, batches, carbon_trend } = data;
  const last7 = carbon_trend.slice(-7);

  return (
    <div className="space-y-4" data-testid="tqc-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">TQC — Traceability, Quality & Carbon Intelligence</h1>
        <p className="text-sm text-slate-500">Batch traceability, defect tracking and carbon emissions, last 14 days.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={ClipboardCheck} label="Batches" value={kpis.batches} />
        <KpiCard icon={AlertTriangle} label="Avg Defect Rate" value={`${kpis.avg_defect_rate_pct}%`} color={kpis.avg_defect_rate_pct > 4 ? "text-red-600" : "text-emerald-600"} />
        <KpiCard icon={AlertTriangle} label="Failed Batches" value={kpis.failed_batches} color="text-red-600" />
        <KpiCard icon={Leaf} label="Carbon (30d)" value={`${(kpis.total_carbon_kg_30d / 1000).toFixed(1)} T`} color="text-emerald-600" />
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">Quality Batches</span>
        </div>
        <table className="w-full text-sm" data-testid="tqc-batches-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Batch</th>
              <th className="py-2 px-2 font-semibold">Product</th>
              <th className="py-2 px-2 font-semibold">Line / Operator</th>
              <th className="py-2 px-2 font-semibold">Produced</th>
              <th className="py-2 px-2 font-semibold">Defect %</th>
              <th className="py-2 px-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="py-2 px-2 font-mono text-xs text-slate-600">{b.batch_no}</td>
                <td className="py-2 px-2 font-medium text-slate-800">{b.product}</td>
                <td className="py-2 px-2 text-xs text-slate-500">{b.traceability.line} · {b.traceability.operator}</td>
                <td className="py-2 px-2 font-mono">{b.good_qty}/{b.produced_qty}</td>
                <td className="py-2 px-2 font-mono">{b.defect_rate_pct}%</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${STATUS_STYLES[b.status]}`}>{b.status}</span>
                </td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No batches recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Factory className="h-4 w-4 text-emerald-600" />
          <span className="font-semibold text-sm text-slate-800">Carbon Emissions — Last 7 Days</span>
        </div>
        <div className="space-y-1.5">
          {last7.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="text-xs text-slate-500 w-24">{c.date}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (c.total_kg / Math.max(...last7.map(x => x.total_kg))) * 100)}%` }} />
              </div>
              <span className="text-xs font-mono text-slate-600 w-20 text-right">{c.total_kg} kg</span>
            </div>
          ))}
          {last7.length === 0 && <div className="text-xs text-slate-400">No carbon data recorded.</div>}
        </div>
      </div>
    </div>
  );
}
