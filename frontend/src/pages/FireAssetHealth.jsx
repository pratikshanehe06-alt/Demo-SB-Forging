import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { HeartPulse, AlertCircle } from "lucide-react";

function healthColor(h) {
  if (h >= 80) return "#10b981";
  if (h >= 55) return "#f59e0b";
  return "#ef4444";
}

function HealthDonut({ healthy, warning, critical }) {
  const total = healthy + warning + critical || 1;
  const segments = [
    { value: healthy, color: "#10b981" },
    { value: warning, color: "#f59e0b" },
    { value: critical, color: "#ef4444" },
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
        return <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={offset} />;
      })}
    </svg>
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

export default function FireAssetHealth() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/fire/assets/health-overview").then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4" data-testid="fire-asset-health-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Asset Health Overview</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const h = data.health_overview;

  return (
    <div className="space-y-4" data-testid="fire-asset-health-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Asset Health Overview</h1>
        <p className="text-sm text-slate-500">Health distribution across all fire & safety devices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 flex items-center gap-5">
          <HealthDonut {...h} />
          <div className="space-y-1.5 text-sm">
            <Legend color="#10b981" label="Healthy" value={h.healthy} />
            <Legend color="#f59e0b" label="Warning" value={h.warning} />
            <Legend color="#ef4444" label="Critical" value={h.critical} />
            <div className="pt-2 border-t mt-2 text-xs text-slate-500">
              Average: <span className="font-mono font-semibold text-slate-800">{h.average}%</span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-sm text-slate-800">Lowest-Health Fire Assets</span>
          </div>
          <div className="space-y-1">
            {data.worst_assets.map((a) => (
              <Link key={a.id} to={`/fire-safety/assets/${a.id}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <HeartPulse className="h-3.5 w-3.5 shrink-0" style={{ color: healthColor(a.health) }} />
                  <span className="font-medium text-slate-800 truncate">{a.asset_code}</span>
                  <span className="text-xs text-slate-400 truncate">{a.asset_type.replace("_", " ")}</span>
                </div>
                <span className="font-mono font-semibold shrink-0" style={{ color: healthColor(a.health) }}>{a.health}%</span>
              </Link>
            ))}
            {data.worst_assets.length === 0 && <div className="text-sm text-slate-400">No fire assets found.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
