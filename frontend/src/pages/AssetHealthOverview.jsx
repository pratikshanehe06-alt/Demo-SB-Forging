import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { HeartPulse, AlertCircle } from "lucide-react";

function healthColor(h) {
  if (h >= 80) return "#10b981";
  if (h >= 55) return "#f59e0b";
  return "#ef4444";
}

function HealthDonut({ healthy, warning, critical, offline }) {
  const total = healthy + warning + critical + offline || 1;
  const segments = [
    { value: healthy, color: "#10b981" },
    { value: warning, color: "#f59e0b" },
    { value: critical, color: "#ef4444" },
    { value: offline, color: "#94a3b8" },
  ];
  let acc = 0;
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
      {segments.map((s, i) => {
        const frac = s.value / total;
        const dash = frac * c;
        const offset = c - (acc / total) * c;
        acc += s.value;
        return (
          <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="12"
                  strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={offset} />
        );
      })}
    </svg>
  );
}

export default function AssetHealthOverview() {
  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get("/dashboard/summary"), api.get("/assets")]).then(([s, a]) => {
      setSummary(s.data);
      setAssets(a.data);
      setLoading(false);
    });
  }, []);

  if (loading || !summary) {
    return (
      <div className="space-y-4" data-testid="asset-health-overview-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Asset Health Overview</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const h = summary.health_overview;
  const worst = [...assets].sort((a, b) => a.health - b.health).slice(0, 15);

  return (
    <div className="space-y-4" data-testid="asset-health-overview-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Asset Health Overview</h1>
        <p className="text-sm text-slate-500">Fleet-wide health distribution across all monitored assets.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 flex items-center gap-5">
          <HealthDonut {...h} />
          <div className="space-y-1.5 text-sm">
            <Legend color="#10b981" label="Healthy" value={h.healthy} />
            <Legend color="#f59e0b" label="Warning" value={h.warning} />
            <Legend color="#ef4444" label="Critical" value={h.critical} />
            <Legend color="#94a3b8" label="Offline" value={h.offline} />
            <div className="pt-2 border-t mt-2 text-xs text-slate-500">
              Fleet average: <span className="font-mono font-semibold text-slate-800">{h.average}%</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-sm text-slate-800">Lowest-Health Assets</span>
          </div>
          <div className="space-y-1">
            {worst.map((a) => (
              <Link key={a.id} to={`/assets/${a.id}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <HeartPulse className="h-3.5 w-3.5 shrink-0" style={{ color: healthColor(a.health) }} />
                  <span className="font-medium text-slate-800 truncate">{a.asset_code}</span>
                  <span className="text-xs text-slate-400 truncate">{a.asset_type}</span>
                </div>
                <span className="font-mono font-semibold shrink-0" style={{ color: healthColor(a.health) }}>{a.health}%</span>
              </Link>
            ))}
            {worst.length === 0 && <div className="text-sm text-slate-400">No assets found.</div>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="font-semibold text-sm text-slate-800 mb-3">Assets by Area</div>
        <div className="space-y-2">
          {summary.assets_by_area.map((a) => (
            <div key={a.area} className="flex items-center gap-3">
              <span className="text-sm text-slate-600 w-40 truncate">{a.area}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-[color:var(--brand-navy)] rounded-full"
                     style={{ width: `${(a.count / Math.max(...summary.assets_by_area.map((x) => x.count))) * 100}%` }} />
              </div>
              <span className="text-xs font-mono text-slate-500 w-8 text-right">{a.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-slate-600 w-16">{label}</span>
      <span className="font-mono font-semibold text-slate-800">{value}</span>
    </div>
  );
}
