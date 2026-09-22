import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Droplets, Waves, Gauge, Fuel, Siren, Clock } from "lucide-react";

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

const CRITICALITY_STYLES = {
  HIGH: "text-red-700 bg-red-50 border-red-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
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

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function metricSummary(asset) {
  const m = asset.metrics || {};
  if (asset.asset_type === "HYDRANT" || asset.asset_type === "FIRE_PUMP") return m.pressure_bar !== undefined ? `${m.pressure_bar} bar` : "—";
  if (asset.asset_type === "FIRE_WATER_TANK") return m.level_pct !== undefined ? `${m.level_pct}%` : "—";
  if (asset.asset_type === "SPRINKLER_SYSTEM") return `${m.zones_ready ?? 0}/${m.zones_total ?? 0} zones`;
  if (asset.asset_type === "HOOTER") return asset.status === "ALARM" ? "Active" : "Standby";
  return "—";
}

function FireAssetCard({ asset }) {
  const meta = TYPE_META[asset.asset_type] || TYPE_META.HYDRANT;
  const Icon = meta.icon;

  return (
    <Link
      to={`/fire-safety/assets/${asset.id}`}
      data-testid={`fire-asset-card-${asset.asset_code}`}
      className="group flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 border border-slate-100">
            <Icon className="h-4 w-4 text-[color:var(--brand-navy)]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{asset.asset_code}</div>
            <div className="text-xs text-slate-500 truncate">{meta.label}</div>
          </div>
        </div>
        <StatusPill status={asset.status} />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Health</span>
          <span className="font-medium text-slate-700">{asset.health}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full ${healthColor(asset.health)}`} style={{ width: `${Math.max(2, asset.health)}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
        <span className="font-medium text-slate-700">{metricSummary(asset)}</span>
        {asset.criticality && (
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${CRITICALITY_STYLES[asset.criticality] || CRITICALITY_STYLES.LOW}`}>
            {asset.criticality}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Clock className="h-3 w-3" />
        <span>Last seen {timeAgo(asset.last_seen)}</span>
      </div>
    </Link>
  );
}

export default function FireAssetStatus() {
  const [data, setData] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    api.get("/fire/assets/status-overview").then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4" data-testid="fire-asset-status-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Asset Status</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { total, by_status, by_type, assets } = data;
  const visible = typeFilter === "all" ? assets : assets.filter((a) => a.asset_type === typeFilter);

  return (
    <div className="space-y-4" data-testid="fire-asset-status-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Asset Status</h1>
        <p className="text-sm text-slate-500">All fire & safety devices — hydrants, sprinklers, pumps, tanks and hooters — in one place.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {["NORMAL", "ATTENTION", "ALARM", "FAULT", "OFFLINE"].map((s) => (
          <div key={s} className="bg-white rounded-lg border border-[color:var(--border)] p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s}</div>
            <div className="mt-2 text-2xl font-mono font-bold tabular text-slate-900">{by_status[s] || 0}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setTypeFilter("all")}
          className={`px-3 py-1.5 rounded-md text-xs font-medium border ${typeFilter === "all" ? "bg-[color:var(--brand-navy)] text-white border-[color:var(--brand-navy)]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
        >
          All ({total})
        </button>
        {Object.entries(TYPE_META).map(([key, meta]) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border flex items-center gap-1 ${typeFilter === key ? "bg-[color:var(--brand-navy)] text-white border-[color:var(--brand-navy)]" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
          >
            <meta.icon className="h-3.5 w-3.5" /> {meta.label} ({by_type[key]?.count ?? 0})
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {visible.map((a) => (
          <FireAssetCard key={a.id} asset={a} />
        ))}
        {visible.length === 0 && <div className="text-sm text-slate-400 col-span-full">No fire assets for this filter.</div>}
      </div>
    </div>
  );
}
