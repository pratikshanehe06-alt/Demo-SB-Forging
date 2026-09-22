import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sun, BatteryCharging, Plug, Gauge, AlertTriangle, CheckCircle2, Clock, Zap,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  WARNING: "text-amber-700 bg-amber-50 border-amber-200",
  FAULT: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
  RUNNING: "text-blue-700 bg-blue-50 border-blue-200",
  STOPPED: "text-slate-600 bg-slate-50 border-slate-200",
  SYNCED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  NOT_SYNCED: "text-amber-700 bg-amber-50 border-amber-200",
};

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  HIGH: "text-orange-700 bg-orange-50 border-orange-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
};

const EVENT_LABELS = {
  INVERTER_FAULT: "Inverter Fault",
  STRING_UNDERPERFORMANCE: "String Underperformance",
  THERMAL_WARNING: "Thermal Warning",
  SOC_LOW: "SoC Low",
  CONNECTOR_FAULT: "Connector Fault",
  SYNC_LOSS: "Sync Loss",
  OVERLOAD: "Overload",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status.replace("_", " ")}
    </span>
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

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-[color:var(--brand-navy)]" />
      <span className="font-semibold text-sm text-slate-800">{title}</span>
    </div>
  );
}

function SolarCard({ array, history }) {
  const chartData = history.map((r) => ({
    time: new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    gen: r.generation_kw,
  }));
  const l = array.latest || {};
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><Sun className="h-4 w-4 text-amber-500" /><span className="font-semibold text-sm">{array.name}</span></div>
        <StatusPill status={array.status} />
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-mono font-bold">{l.generation_kw ?? 0}</span>
        <span className="text-sm text-slate-500">kW / {array.capacity_kwp} kWp</span>
      </div>
      <div className="text-xs text-slate-500 mb-2">PR: <span className="font-mono font-semibold text-slate-700">{l.pr_pct ?? "—"}%</span></div>
      {chartData.length > 1 && (
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="gen" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function BessCard({ unit, history }) {
  const chartData = history.map((r) => ({
    time: new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    soc: r.soc_pct,
  }));
  const l = unit.latest || {};
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2"><BatteryCharging className="h-4 w-4 text-emerald-600" /><span className="font-semibold text-sm">{unit.name}</span></div>
        <StatusPill status={unit.status} />
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-mono font-bold">{(l.soc_pct ?? unit.soc_pct).toFixed(0)}%</span>
        <span className="text-sm text-slate-500">SoC</span>
      </div>
      <div className="text-xs text-slate-500 mb-2">
        Power: <span className={`font-mono font-semibold ${l.power_kw > 0 ? "text-emerald-600" : "text-blue-600"}`}>{l.power_kw ?? 0} kW</span>
        {" · "}SoH: <span className="font-mono font-semibold text-slate-700">{unit.soh_pct}%</span>
      </div>
      {chartData.length > 1 && (
        <div className="h-24">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="soc" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default function DERMSPage() {
  const [summary, setSummary] = useState(null);
  const [solarHistories, setSolarHistories] = useState({});
  const [bessHistories, setBessHistories] = useState({});
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await api.get("/derms/summary");
    setSummary(data);
    const [sh, bh] = await Promise.all([
      Promise.all(data.solar.map((s) => api.get(`/derms/solar/${s.id}/history`, { params: { limit: 40 } }).then((r) => [s.id, r.data]))),
      Promise.all(data.bess.map((b) => api.get(`/derms/bess/${b.id}/history`, { params: { limit: 40 } }).then((r) => [b.id, r.data]))),
    ]);
    setSolarHistories(Object.fromEntries(sh));
    setBessHistories(Object.fromEntries(bh));
    const eventsRes = await api.get("/derms/events", { params: { limit: 100 } });
    setEvents(eventsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function acknowledge(id) {
    try {
      await api.post(`/derms/events/${id}/acknowledge`);
      toast.success("Event acknowledged");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to acknowledge");
    }
  }

  if (loading || !summary) {
    return (
      <div className="space-y-4" data-testid="derms-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">DERMS</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, solar, bess, ev_stations, dg_sets, recent_events } = summary;

  return (
    <div className="space-y-4" data-testid="derms-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Distributed Energy Resource Management</h1>
        <p className="text-sm text-slate-500">Solar PV, battery storage, EV charging and DG synchronization.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard icon={Sun} label="Solar Gen" value={`${kpis.solar_generation_kw} kW`} color="text-amber-500" />
        <KpiCard icon={Gauge} label="Avg PR" value={`${kpis.solar_avg_pr_pct}%`} />
        <KpiCard icon={BatteryCharging} label="BESS SoC" value={`${kpis.bess_avg_soc_pct}%`} color="text-emerald-600" />
        <KpiCard icon={Zap} label="BESS Power" value={`${kpis.bess_power_kw} kW`} />
        <KpiCard icon={Plug} label="EV Connectors" value={kpis.ev_connectors_active} />
        <KpiCard icon={Gauge} label="DG Synced" value={kpis.dg_synced} />
        <KpiCard icon={AlertTriangle} label="Active Events" value={kpis.active_events} color={kpis.active_events > 0 ? "text-amber-600" : "text-emerald-600"} />
      </div>

      <div>
        <SectionHeader icon={Sun} title="Solar PV" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {solar.map((s) => <SolarCard key={s.id} array={s} history={solarHistories[s.id] || []} />)}
          {solar.length === 0 && <div className="text-sm text-slate-400 col-span-full">No solar arrays configured.</div>}
        </div>
      </div>

      <div>
        <SectionHeader icon={BatteryCharging} title="BESS" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {bess.map((b) => <BessCard key={b.id} unit={b} history={bessHistories[b.id] || []} />)}
          {bess.length === 0 && <div className="text-sm text-slate-400 col-span-full">No BESS units configured.</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <SectionHeader icon={Plug} title="EV Charging Stations" />
          <div className="bg-white rounded-lg border border-[color:var(--border)] p-4 space-y-2">
            {ev_stations.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{s.connectors_active}/{s.connectors_total} active · {s.power_kw} kW</span>
                  <StatusPill status={s.status} />
                </div>
              </div>
            ))}
            {ev_stations.length === 0 && <div className="text-xs text-slate-400">No EV stations configured.</div>}
          </div>
        </div>
        <div>
          <SectionHeader icon={Gauge} title="DG Synchronization" />
          <div className="bg-white rounded-lg border border-[color:var(--border)] p-4 space-y-2">
            {dg_sets.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{d.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{d.load_kw} kW / {d.rated_kva} kVA</span>
                  <StatusPill status={d.status} />
                  <StatusPill status={d.sync_status} />
                </div>
              </div>
            ))}
            {dg_sets.length === 0 && <div className="text-xs text-slate-400">No DG sets configured.</div>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <SectionHeader icon={AlertTriangle} title="DERMS Events" />
        <table className="w-full text-sm" data-testid="derms-events-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Time</th>
              <th className="py-2 px-2 font-semibold">Source</th>
              <th className="py-2 px-2 font-semibold">Event</th>
              <th className="py-2 px-2 font-semibold">Severity</th>
              <th className="py-2 px-2 font-semibold">Status</th>
              <th className="py-2 px-2 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="py-2 px-2 text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {new Date(e.started_at).toLocaleString()}
                </td>
                <td className="py-2 px-2 font-medium text-slate-800">{e.source_type}</td>
                <td className="py-2 px-2 text-slate-700">{EVENT_LABELS[e.event_type] || e.event_type}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.LOW}`}>
                    {e.severity}
                  </span>
                </td>
                <td className="py-2 px-2 text-xs text-slate-600">{e.status}</td>
                <td className="py-2 px-2 text-right">
                  {e.status === "OPEN" ? (
                    <Button size="sm" variant="outline" onClick={() => acknowledge(e.id)} data-testid={`ack-derms-event-${e.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Acknowledge
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No DERMS events recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
