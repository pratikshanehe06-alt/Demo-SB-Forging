import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Droplet, Wind, Flame, Fuel, CloudFog, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";

const UTILITY_META = {
  WATER: { label: "Water", icon: Droplet, color: "text-blue-600" },
  AIR: { label: "Air", icon: Wind, color: "text-cyan-600" },
  GAS: { label: "Gas", icon: Flame, color: "text-orange-600" },
  OIL_FUEL: { label: "Oil / Fuel", icon: Fuel, color: "text-amber-700" },
  STEAM: { label: "Steam", icon: CloudFog, color: "text-slate-500" },
};

const STATUS_STYLES = {
  RUNNING: "text-emerald-700 bg-emerald-50 border-emerald-200",
  IDLE: "text-amber-700 bg-amber-50 border-amber-200",
  FAULT: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  MAJOR: "text-orange-700 bg-orange-50 border-orange-200",
  MINOR: "text-slate-600 bg-slate-50 border-slate-200",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status}
    </span>
  );
}

function UtilityCard({ utype, data, selected, onClick }) {
  const meta = UTILITY_META[utype];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      data-testid={`ums-utility-${utype.toLowerCase()}`}
      className={`text-left rounded-lg border p-4 transition ${
        selected ? "border-[color:var(--brand-navy)] ring-2 ring-[color:var(--brand-navy)]/20 bg-white"
                 : "border-[color:var(--border)] bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${meta.color}`} />
          <span className="font-semibold text-sm text-slate-800">{meta.label}</span>
        </div>
        <span className="text-xs text-slate-400">{data.asset_count} assets</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[9px] uppercase text-slate-400">Running</div>
          <div className="text-sm font-mono font-semibold text-emerald-600">{data.running}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-400">Avg Health</div>
          <div className="text-sm font-mono font-semibold text-slate-700">{data.avg_health}%</div>
        </div>
        <div>
          <div className="text-[9px] uppercase text-slate-400">Fault</div>
          <div className="text-sm font-mono font-semibold text-red-600">{data.fault}</div>
        </div>
      </div>
    </button>
  );
}

export default function UMSPage() {
  const [summary, setSummary] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [selectedType, setSelectedType] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [sumRes, alarmsRes] = await Promise.all([
      api.get("/ums/summary"),
      api.get("/ums/alarms", { params: { limit: 100 } }),
    ]);
    setSummary(sumRes.data);
    setAlarms(alarmsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function acknowledge(id) {
    try {
      await api.post(`/ums/alarms/${id}/acknowledge`);
      toast.success("Alarm acknowledged");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to acknowledge");
    }
  }

  if (loading || !summary) {
    return (
      <div className="space-y-4" data-testid="ums-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Utility Management System</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { by_type, assets, recent_alarms } = summary;
  const visibleAssets = selectedType ? assets.filter((a) => a.utility_type === selectedType) : assets;
  const visibleAlarms = selectedType ? alarms.filter((a) => a.utility_type === selectedType) : alarms;

  return (
    <div className="space-y-4" data-testid="ums-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Utility Management System</h1>
        <p className="text-sm text-slate-500">Water, Air, Gas, Oil-Fuel and Steam — click a utility to filter below.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Object.entries(UTILITY_META).map(([key]) => (
          <UtilityCard
            key={key}
            utype={key}
            data={by_type[key]}
            selected={selectedType === key}
            onClick={() => setSelectedType(selectedType === key ? null : key)}
          />
        ))}
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-sm text-slate-800">
            {selectedType ? `${UTILITY_META[selectedType].label} Assets` : "All Utility Assets"}
          </span>
          {selectedType && <Button size="sm" variant="outline" onClick={() => setSelectedType(null)}>Clear filter</Button>}
        </div>
        <table className="w-full text-sm" data-testid="ums-assets-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Asset</th>
              <th className="py-2 px-2 font-semibold">Type</th>
              <th className="py-2 px-2 font-semibold">Flow</th>
              <th className="py-2 px-2 font-semibold">Pressure</th>
              <th className="py-2 px-2 font-semibold">Health</th>
              <th className="py-2 px-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visibleAssets.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-2 px-2 font-medium text-slate-800">{a.asset_code} — {a.name}</td>
                <td className="py-2 px-2 text-slate-600">{UTILITY_META[a.utility_type]?.label}</td>
                <td className="py-2 px-2 font-mono text-slate-700">{a.flow_rate} {a.unit}</td>
                <td className="py-2 px-2 font-mono text-slate-700">{a.pressure} bar</td>
                <td className="py-2 px-2 font-mono text-slate-700">{a.health}%</td>
                <td className="py-2 px-2"><StatusPill status={a.status} /></td>
              </tr>
            ))}
            {visibleAssets.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No assets for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">UMS Alarms</span>
        </div>
        <table className="w-full text-sm" data-testid="ums-alarms-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Time</th>
              <th className="py-2 px-2 font-semibold">Asset</th>
              <th className="py-2 px-2 font-semibold">Message</th>
              <th className="py-2 px-2 font-semibold">Severity</th>
              <th className="py-2 px-2 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleAlarms.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-2 px-2 text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {new Date(a.created_at).toLocaleString()}
                </td>
                <td className="py-2 px-2 font-medium text-slate-800">{a.asset_code}</td>
                <td className="py-2 px-2 text-slate-700">{a.message}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.MINOR}`}>
                    {a.severity}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  {a.acknowledged ? (
                    <span className="text-xs text-slate-400 flex items-center justify-end gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Acknowledged
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)} data-testid={`ack-ums-alarm-${a.id}`}>
                      Acknowledge
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {visibleAlarms.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">No alarms for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
