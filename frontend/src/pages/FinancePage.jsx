import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { IndianRupee, TrendingUp, PieChart } from "lucide-react";

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

const CATEGORY_COLORS = {
  LABOR: "#1e3a8a", MATERIAL: "#f59e0b", ENERGY: "#10b981", MAINTENANCE: "#ef4444", OVERHEAD: "#94a3b8",
};

function fmtInr(n) {
  return `₹${(n / 100000).toFixed(1)}L`;
}

export default function FinancePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/finance/summary").then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4" data-testid="finance-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Financial Intelligence</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, monthly, cost_breakdown } = data;
  const totalBreakdown = cost_breakdown.reduce((a, c) => a + c.amount_inr, 0) || 1;

  return (
    <div className="space-y-4" data-testid="finance-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Financial Intelligence</h1>
        <p className="text-sm text-slate-500">Revenue, cost and margin analytics tied to plant operations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard icon={IndianRupee} label="Total Revenue" value={fmtInr(kpis.total_revenue_inr)} />
        <KpiCard icon={IndianRupee} label="Total Cost" value={fmtInr(kpis.total_cost_inr)} color="text-red-600" />
        <KpiCard icon={TrendingUp} label="Avg Margin" value={`${kpis.avg_margin_pct}%`} color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <PieChart className="h-4 w-4 text-[color:var(--brand-navy)]" />
            <span className="font-semibold text-sm text-slate-800">Cost Breakdown</span>
          </div>
          <div className="space-y-2">
            {cost_breakdown.map((c) => (
              <div key={c.category} className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[c.category] }} />
                <span className="text-sm text-slate-600 w-28">{c.category}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(c.amount_inr / totalBreakdown) * 100}%`, backgroundColor: CATEGORY_COLORS[c.category] }} />
                </div>
                <span className="text-xs font-mono text-slate-500 w-16 text-right">{fmtInr(c.amount_inr)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="font-semibold text-sm text-slate-800 mb-3">Monthly Trend</div>
          <table className="w-full text-sm" data-testid="finance-monthly-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-2 px-2 font-semibold">Month</th>
                <th className="py-2 px-2 font-semibold text-right">Revenue</th>
                <th className="py-2 px-2 font-semibold text-right">Cost</th>
                <th className="py-2 px-2 font-semibold text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 px-2 font-medium text-slate-800">{m.month}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmtInr(m.revenue_inr)}</td>
                  <td className="py-2 px-2 text-right font-mono text-red-600">{fmtInr(m.cost_inr)}</td>
                  <td className="py-2 px-2 text-right font-mono text-emerald-600">{m.margin_pct}%</td>
                </tr>
              ))}
              {monthly.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-slate-400">No financial records yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
