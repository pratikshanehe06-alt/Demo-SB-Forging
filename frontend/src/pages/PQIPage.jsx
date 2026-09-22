import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Activity, Zap, Gauge, Waves, AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { toast } from "sonner";

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  WARNING: "text-amber-700 bg-amber-50 border-amber-200",
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  HIGH: "text-orange-700 bg-orange-50 border-orange-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
};

const EVENT_LABELS = {
  VOLTAGE_SAG: "Voltage Sag",
  VOLTAGE_SWELL: "Voltage Swell",
  HARMONIC_DISTORTION: "Harmonic Distortion",
  FREQUENCY_DEVIATION: "Frequency Deviation",
  VOLTAGE_UNBALANCE: "Voltage Unbalance",
  INTERRUPTION: "Interruption",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status}
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

function MainCard({ main, history }) {
  const chartData = history.map((r) => ({
    time: new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    voltage: r.voltage_r,
    pf: r.power_factor,
  }));
  const l = main.latest || {};

  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4" data-testid={`pqi-main-${main.name}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">{main.name}</span>
        </div>
        <StatusPill status={main.status} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <MetricBox label="Voltage" value={`${l.voltage_r ?? "—"}V`} />
        <MetricBox label="PF" value={l.power_factor ?? "—"} />
        <MetricBox label="Freq" value={`${l.frequency_hz ?? "—"}Hz`} />
        <MetricBox label="THD-V" value={`${l.thd_voltage_pct ?? "—"}%`} />
        <MetricBox label="THD-I" value={`${l.thd_current_pct ?? "—"}%`} />
        <MetricBox label="Unbalance" value={`${l.voltage_unbalance_pct ?? "—"}%`} />
      </div>

      {chartData.length > 1 && (
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9 }} domain={["dataMin - 2", "dataMax + 2"]} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="voltage" stroke="#1e3a8a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-md py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xs font-mono font-semibold text-slate-800">{value}</div>
    </div>
  );
}

export default function PQIPage() {
  const [summary, setSummary] = useState(null);
  const [histories, setHistories] = useState({});
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const sumRes = await api.get("/pqi/summary");
    setSummary(sumRes.data);
    const historyEntries = await Promise.all(
      sumRes.data.mains.map((m) => api.get(`/pqi/mains/${m.id}/history`, { params: { limit: 40 } }).then((r) => [m.id, r.data]))
    );
    setHistories(Object.fromEntries(historyEntries));
    const eventsRes = await api.get("/pqi/events", { params: { limit: 100 } });
    setEvents(eventsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function acknowledge(id) {
    try {
      await api.post(`/pqi/events/${id}/acknowledge`);
      toast.success("Event acknowledged");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to acknowledge");
    }
  }

  if (loading || !summary) {
    return (
      <div className="space-y-4" data-testid="pqi-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Power Quality Intelligence</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, mains, recent_events } = summary;

  return (
    <div className="space-y-4" data-testid="pqi-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Power Quality Intelligence</h1>
        <p className="text-sm text-slate-500">Voltage, power factor, THD and frequency monitoring across incoming mains.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Gauge} label="Avg Power Factor" value={kpis.avg_power_factor} />
        <KpiCard icon={Waves} label="Avg THD-V" value={`${kpis.avg_thd_voltage_pct}%`} />
        <KpiCard icon={Waves} label="Avg THD-I" value={`${kpis.avg_thd_current_pct}%`} />
        <KpiCard icon={AlertTriangle} label="Active Events" value={kpis.active_events} color={kpis.active_events > 0 ? "text-amber-600" : "text-emerald-600"} />
        <KpiCard icon={AlertTriangle} label="Critical Events" value={kpis.critical_events} color={kpis.critical_events > 0 ? "text-red-600" : "text-emerald-600"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {mains.map((m) => (
          <MainCard key={m.id} main={m} history={histories[m.id] || []} />
        ))}
        {mains.length === 0 && <div className="text-sm text-slate-400 col-span-full">No mains configured.</div>}
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">Power Quality Events</span>
        </div>
        <table className="w-full text-sm" data-testid="pqi-events-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Time</th>
              <th className="py-2 px-2 font-semibold">Main</th>
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
                <td className="py-2 px-2 font-medium text-slate-800">{e.main_name}</td>
                <td className="py-2 px-2 text-slate-700">{EVENT_LABELS[e.event_type] || e.event_type}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.LOW}`}>
                    {e.severity}
                  </span>
                </td>
                <td className="py-2 px-2 text-xs text-slate-600">{e.status}</td>
                <td className="py-2 px-2 text-right">
                  {e.status === "OPEN" ? (
                    <Button size="sm" variant="outline" onClick={() => acknowledge(e.id)} data-testid={`ack-pqi-event-${e.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Acknowledge
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">Resolved</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No power quality events recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
