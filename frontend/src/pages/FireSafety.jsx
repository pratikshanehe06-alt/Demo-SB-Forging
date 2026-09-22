import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Flame, Gauge, Droplets, Waves, Fuel, Siren, ShieldCheck,
  AlertTriangle, Clock, MapPin,
} from "lucide-react";

const STATUS_STYLES = {
  READY: "text-emerald-700 bg-emerald-50 border-emerald-200",
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  RUNNING: "text-blue-700 bg-blue-50 border-blue-200",
  ATTENTION: "text-amber-700 bg-amber-50 border-amber-200",
  ALARM: "text-red-700 bg-red-50 border-red-200",
  FAULT: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

const OVERALL_STATUS_STYLES = { READY: "bg-emerald-500", ATTENTION: "bg-amber-500", ALARM: "bg-red-500" };

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  HIGH: "text-orange-700 bg-orange-50 border-orange-200",
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

function ReadinessRing({ score }) {
  const r = 42, c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative h-32 w-32 shrink-0">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-mono font-bold text-slate-900">{score}%</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Ready</span>
      </div>
    </div>
  );
}

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

function SystemCard({ icon: Icon, title, assets, metricFn }) {
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-[color:var(--brand-navy)]" />
        <span className="font-semibold text-sm text-slate-800">{title}</span>
      </div>
      <div className="space-y-2">
        {assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-600 truncate">{a.name}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono text-slate-800">{metricFn(a)}</span>
              <StatusPill status={a.status} />
            </div>
          </div>
        ))}
        {assets.length === 0 && <div className="text-xs text-slate-400">No data yet</div>}
      </div>
    </div>
  );
}

export default function FireSafety() {
  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [sumRes, assetsRes] = await Promise.all([
      api.get("/fire/summary"),
      api.get("/fire/assets"),
    ]);
    setSummary(sumRes.data);
    setAssets(assetsRes.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !summary) {
    return (
      <div className="space-y-4" data-testid="fire-safety-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire & Safety Command Center</h1>
        <div className="text-sm text-slate-500">Loading safety status…</div>
      </div>
    );
  }

  const { overall_status, readiness_score, kpis, zones, recent_incidents } = summary;
  const byType = (t) => assets.filter((a) => a.asset_type === t);

  return (
    <div className="space-y-4" data-testid="fire-safety-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Fire & Safety Command Center</h1>
          <p className="text-sm text-slate-500">Real-time fire safety system status and incident management</p>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-white text-sm font-semibold ${OVERALL_STATUS_STYLES[overall_status] || "bg-slate-500"}`}>
          Overall Status: {overall_status}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiCard icon={AlertTriangle} label="Critical Alarms" value={kpis.critical_alarms} color={kpis.critical_alarms > 0 ? "text-red-600" : "text-emerald-600"} />
        <KpiCard icon={Gauge} label="Hydrant Pressure" value={`${kpis.avg_hydrant_pressure} bar`} />
        <KpiCard icon={Droplets} label="Sprinklers Ready" value={kpis.sprinklers_ready} />
        <KpiCard icon={Waves} label="Fire Pumps Ready" value={kpis.pumps_ready} />
        <KpiCard icon={Fuel} label="Fire Water Tank" value={`${kpis.avg_tank_pct}%`} />
        <KpiCard icon={Siren} label="Hooters Active" value={kpis.hooters_active} color={kpis.hooters_active > 0 ? "text-red-600" : "text-emerald-600"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 flex items-center gap-5">
          <ReadinessRing score={readiness_score} />
          <div>
            <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Safety Readiness Score
            </div>
            <p className="text-xs text-slate-500 mt-1">Composite of fire alarm, hydrant, sprinkler, fire pump, tank and emergency system status.</p>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg border border-[color:var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-4 w-4 text-[color:var(--brand-navy)]" />
            <span className="font-semibold text-sm text-slate-800">Fire Zones</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between px-3 py-2 rounded-md border border-slate-100 bg-slate-50">
                <span className="text-sm font-medium text-slate-700">{z.name}</span>
                <StatusPill status={z.status} />
              </div>
            ))}
            {zones.length === 0 && <div className="text-xs text-slate-400 col-span-full">No zones configured</div>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SystemCard icon={Droplets} title="Hydrant System" assets={byType("HYDRANT")} metricFn={(a) => `${a.metrics?.pressure_bar ?? "—"} bar`} />
        <SystemCard icon={Waves} title="Sprinkler System" assets={byType("SPRINKLER_SYSTEM")} metricFn={(a) => `${a.metrics?.zones_ready ?? 0}/${a.metrics?.zones_total ?? 0} zones`} />
        <SystemCard icon={Gauge} title="Fire Pumps" assets={byType("FIRE_PUMP")} metricFn={(a) => `${a.metrics?.pressure_bar ?? "—"} bar`} />
        <SystemCard icon={Fuel} title="Fire-Water Tank" assets={byType("FIRE_WATER_TANK")} metricFn={(a) => `${a.metrics?.level_pct ?? "—"}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Siren className="h-4 w-4 text-[color:var(--brand-navy)]" />
            <span className="font-semibold text-sm text-slate-800">Emergency Hooters</span>
          </div>
          <div className="space-y-2">
            {byType("HOOTER").map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{h.name}</span>
                <StatusPill status={h.status} />
              </div>
            ))}
            {byType("HOOTER").length === 0 && <div className="text-xs text-slate-400">No hooters configured</div>}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-lg border border-[color:var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[color:var(--brand-navy)]" />
              <span className="font-semibold text-sm text-slate-800">Recent Incidents</span>
            </div>
          </div>
          <div className="space-y-2">
            {recent_incidents.map((inc) => (
              <div key={inc.id} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{inc.event}</div>
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {new Date(inc.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[inc.severity] || SEVERITY_STYLES.LOW}`}>{inc.severity}</span>
                  <span className="text-xs text-slate-500">{inc.status}</span>
                </div>
              </div>
            ))}
            {recent_incidents.length === 0 && <div className="text-xs text-slate-400">No incidents recorded</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
