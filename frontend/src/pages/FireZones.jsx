import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  MapPin, AlertTriangle, Clock, CheckCircle2, XCircle,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ATTENTION: "text-amber-700 bg-amber-50 border-amber-200",
  ALARM: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  HIGH: "text-orange-700 bg-orange-50 border-orange-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
  INFO: "text-blue-700 bg-blue-50 border-blue-200",
};

const EVENT_TYPE_LABELS = {
  SMOKE_DETECTED: "Smoke Detected",
  HEAT_DETECTED: "Heat Detected",
  MANUAL_CALL_POINT: "Manual Call Point",
  PANEL_FAULT: "Panel Fault",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status}
    </span>
  );
}

function ZoneCard({ zone, alarmCount, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      data-testid={`zone-card-${zone.name}`}
      className={`text-left rounded-lg border p-4 transition ${
        selected ? "border-[color:var(--brand-navy)] ring-2 ring-[color:var(--brand-navy)]/20 bg-white"
                 : "border-[color:var(--border)] bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">{zone.name}</span>
        </div>
        <StatusPill status={zone.status} />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <AlertTriangle className={`h-3 w-3 ${alarmCount > 0 ? "text-red-500" : "text-slate-300"}`} />
          {alarmCount} open {alarmCount === 1 ? "alarm" : "alarms"}
        </span>
        {zone.last_alarm_at && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {new Date(zone.last_alarm_at).toLocaleTimeString()}
          </span>
        )}
      </div>
    </button>
  );
}

export default function FireZones() {
  const [zones, setZones] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null); // null = show all
  const [loading, setLoading] = useState(true);

  async function load() {
    const [zonesRes, alarmsRes] = await Promise.all([
      api.get("/fire/zones"),
      api.get("/fire/alarms", { params: { limit: 200 } }),
    ]);
    setZones(zonesRes.data);
    setAlarms(alarmsRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function acknowledge(alarmId) {
    try {
      await api.post(`/fire/alarms/${alarmId}/acknowledge`);
      toast.success("Alarm acknowledged");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to acknowledge");
    }
  }

  const openAlarmCountByZone = {};
  for (const a of alarms) {
    if (a.status !== "RESOLVED") {
      openAlarmCountByZone[a.zone_id] = (openAlarmCountByZone[a.zone_id] || 0) + 1;
    }
  }

  const visibleAlarms = selectedZone
    ? alarms.filter((a) => a.zone_id === selectedZone)
    : alarms;

  if (loading) {
    return (
      <div className="space-y-4" data-testid="fire-zones-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Zones</h1>
        <div className="text-sm text-slate-500">Loading zones…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="fire-zones-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Zones</h1>
        <p className="text-sm text-slate-500">Zone-level status and alarm history — click a zone to filter events below.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {zones.map((z) => (
          <ZoneCard
            key={z.id}
            zone={z}
            alarmCount={openAlarmCountByZone[z.id] || 0}
            selected={selectedZone === z.id}
            onClick={() => setSelectedZone(selectedZone === z.id ? null : z.id)}
          />
        ))}
        {zones.length === 0 && <div className="text-sm text-slate-400 col-span-full">No fire zones configured.</div>}
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-sm text-slate-800">
            {selectedZone ? `Events — ${zones.find((z) => z.id === selectedZone)?.name}` : "All Zone Events"}
          </span>
          {selectedZone && (
            <Button size="sm" variant="outline" onClick={() => setSelectedZone(null)}>Clear filter</Button>
          )}
        </div>
        <table className="w-full text-sm" data-testid="zone-events-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Time</th>
              <th className="py-2 px-2 font-semibold">Zone</th>
              <th className="py-2 px-2 font-semibold">Event</th>
              <th className="py-2 px-2 font-semibold">Severity</th>
              <th className="py-2 px-2 font-semibold">Status</th>
              <th className="py-2 px-2 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleAlarms.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-2 px-2 text-xs text-slate-500">{new Date(a.created_at).toLocaleString()}</td>
                <td className="py-2 px-2 font-medium text-slate-800">{a.zone_name}</td>
                <td className="py-2 px-2 text-slate-700">{EVENT_TYPE_LABELS[a.event_type] || a.event_type}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.LOW}`}>
                    {a.severity}
                  </span>
                </td>
                <td className="py-2 px-2 text-xs text-slate-600">{a.status}</td>
                <td className="py-2 px-2 text-right">
                  {a.status === "OPEN" ? (
                    <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)} data-testid={`ack-alarm-${a.id}`}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Acknowledge
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center justify-end gap-1">
                      {a.status === "RESOLVED" ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <XCircle className="h-3 w-3" />}
                      {a.status === "RESOLVED" ? "Resolved" : "Handled"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {visibleAlarms.length === 0 && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">No events for this filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
