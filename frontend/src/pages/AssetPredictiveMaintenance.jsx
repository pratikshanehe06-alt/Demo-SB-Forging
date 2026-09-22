import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Wrench, TrendingDown, CalendarClock, AlertTriangle } from "lucide-react";

function KpiCard({ icon: Icon, label, value, sub, color = "text-[color:var(--brand-navy)]" }) {
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 text-2xl font-mono font-bold tabular text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function AssetPredictiveMaintenance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/assets/predictive-overview").then((r) => {
      setData(r.data);
      setLoading(false);
    });
  }, []);

  if (loading || !data) {
    return (
      <div className="space-y-4" data-testid="predictive-maintenance-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Predictive Maintenance Overview</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, upcoming_maintenance, high_risk_assets } = data;

  return (
    <div className="space-y-4" data-testid="predictive-maintenance-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Predictive Maintenance Overview</h1>
        <p className="text-sm text-slate-500">MTBF/MTTR trends, upcoming service and highest-risk assets across the fleet.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Wrench} label="Total Assets" value={kpis.total_assets} />
        <KpiCard icon={TrendingDown} label="Avg MTBF" value={`${kpis.avg_mtbf_hours}h`} />
        <KpiCard icon={Wrench} label="Avg MTTR" value={`${kpis.avg_mttr_hours}h`} />
        <KpiCard icon={CalendarClock} label="Due Soon" value={kpis.upcoming_count} color="text-amber-600" />
        <KpiCard icon={AlertTriangle} label="High Risk" value={kpis.high_risk_count} color="text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="h-4 w-4 text-amber-600" />
            <span className="font-semibold text-sm text-slate-800">Upcoming Maintenance Due</span>
          </div>
          <div className="space-y-1">
            {upcoming_maintenance.map((m) => (
              <Link key={m.asset_id} to={`/assets/${m.asset_id}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{m.asset_code}</div>
                  <div className="text-xs text-slate-400 truncate">{m.next_maintenance?.description || "Scheduled service"}</div>
                </div>
                <span className="text-xs text-amber-700 font-medium shrink-0">
                  {new Date(m.next_maintenance.next_due_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
            {upcoming_maintenance.length === 0 && <div className="text-sm text-slate-400">No upcoming maintenance scheduled.</div>}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-sm text-slate-800">High-Risk Assets</span>
          </div>
          <div className="space-y-1">
            {high_risk_assets.map((m) => (
              <Link key={m.asset_id} to={`/assets/${m.asset_id}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{m.asset_code}</div>
                  <div className="text-xs text-slate-400">
                    {m.failure_count} failures · MTBF {m.mtbf_hours}h
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-red-600 shrink-0">{m.health}%</span>
              </Link>
            ))}
            {high_risk_assets.length === 0 && <div className="text-sm text-slate-400">No high-risk assets detected.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
