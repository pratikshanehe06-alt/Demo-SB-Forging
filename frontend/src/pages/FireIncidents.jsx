import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Plus, Flame, Clock, User as UserIcon } from "lucide-react";
import { toast } from "sonner";

const STATUS_TABS = ["ALL", "OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED", "CLOSED"];

const STATUS_STYLES = {
  OPEN: "text-red-700 bg-red-50 border-red-200",
  ACKNOWLEDGED: "text-amber-700 bg-amber-50 border-amber-200",
  INVESTIGATING: "text-blue-700 bg-blue-50 border-blue-200",
  RESOLVED: "text-emerald-700 bg-emerald-50 border-emerald-200",
  CLOSED: "text-slate-600 bg-slate-50 border-slate-200",
};

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  HIGH: "text-orange-700 bg-orange-50 border-orange-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
};

const NEXT_STATUS = {
  OPEN: "ACKNOWLEDGED",
  ACKNOWLEDGED: "INVESTIGATING",
  INVESTIGATING: "RESOLVED",
  RESOLVED: "CLOSED",
};

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.CLOSED}`}>
      {status}
    </span>
  );
}

export default function FireIncidents() {
  const [incidents, setIncidents] = useState([]);
  const [zones, setZones] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    const [incRes, zonesRes] = await Promise.all([
      api.get("/fire/incidents", { params: { limit: 200 } }),
      api.get("/fire/zones"),
    ]);
    setIncidents(incRes.data);
    setZones(zonesRes.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function advance(incident) {
    const next = NEXT_STATUS[incident.status];
    if (!next) return;
    try {
      await api.put(`/fire/incidents/${incident.id}`, { status: next });
      toast.success(`Marked as ${next}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    }
  }

  const counts = STATUS_TABS.reduce((acc, s) => {
    acc[s] = s === "ALL" ? incidents.length : incidents.filter((i) => i.status === s).length;
    return acc;
  }, {});

  const visible = tab === "ALL" ? incidents : incidents.filter((i) => i.status === tab);

  return (
    <div className="space-y-4" data-testid="fire-incidents-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Safety Incidents</h1>
          <p className="text-sm text-slate-500">Track detection through acknowledgement, investigation and resolution.</p>
        </div>
        <Button onClick={() => setOpenCreate(true)} data-testid="new-incident-btn" className="bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)]">
          <Plus className="h-4 w-4 mr-1" /> New incident
        </Button>
      </div>

      <div className="flex gap-1 border-b border-[color:var(--border)]">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setTab(s)}
            data-testid={`incident-tab-${s.toLowerCase()}`}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === s ? "border-[color:var(--brand-navy)] text-[color:var(--brand-navy)]" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()} <span className="text-xs text-slate-400">({counts[s]})</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        {loading ? (
          <div className="text-sm text-slate-500">Loading incidents…</div>
        ) : (
          <table className="w-full text-sm" data-testid="incidents-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-2 px-2 font-semibold">Event</th>
                <th className="py-2 px-2 font-semibold">Zone</th>
                <th className="py-2 px-2 font-semibold">Severity</th>
                <th className="py-2 px-2 font-semibold">Status</th>
                <th className="py-2 px-2 font-semibold">Assigned</th>
                <th className="py-2 px-2 font-semibold">Reported</th>
                <th className="py-2 px-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inc) => {
                const zone = zones.find((z) => z.id === inc.zone_id);
                const next = NEXT_STATUS[inc.status];
                return (
                  <tr key={inc.id} className="border-b last:border-0" data-testid={`incident-row-${inc.id}`}>
                    <td className="py-2.5 px-2 font-medium text-slate-800 flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5 text-red-500 shrink-0" /> {inc.event}
                    </td>
                    <td className="py-2.5 px-2 text-slate-600">{zone?.name || "—"}</td>
                    <td className="py-2.5 px-2">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[inc.severity] || SEVERITY_STYLES.LOW}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-2"><StatusBadge status={inc.status} /></td>
                    <td className="py-2.5 px-2 text-slate-600 flex items-center gap-1">
                      <UserIcon className="h-3 w-3 text-slate-400" /> {inc.assigned_to || "Unassigned"}
                    </td>
                    <td className="py-2.5 px-2 text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {new Date(inc.created_at).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      {next ? (
                        <Button size="sm" variant="outline" onClick={() => advance(inc)} data-testid={`advance-incident-${inc.id}`}>
                          Mark {next.toLowerCase()}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Closed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr><td colSpan={7} className="py-6 text-center text-sm text-slate-400">No incidents in this view.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <NewIncidentDialog open={openCreate} onOpenChange={setOpenCreate} zones={zones} onCreated={load} />
    </div>
  );
}

function NewIncidentDialog({ open, onOpenChange, zones, onCreated }) {
  const [form, setForm] = useState({ event: "", severity: "MEDIUM", zone_id: "", assigned_to: "" });
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.event) { toast.error("Event description is required"); return; }
    try {
      await api.post("/fire/incidents", {
        event: form.event,
        severity: form.severity,
        zone_id: form.zone_id || null,
        assigned_to: form.assigned_to || null,
      });
      toast.success("Incident created");
      onOpenChange(false);
      onCreated();
      setForm({ event: "", severity: "MEDIUM", zone_id: "", assigned_to: "" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Create failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Report a safety incident</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Event</Label>
            <Input className="mt-1" value={form.event} onChange={(e) => set("event", e.target.value)} placeholder="e.g. Smoke detected near Bay 3" data-testid="incident-event-input" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Severity</Label>
            <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
              <SelectTrigger className="mt-1 h-10" data-testid="incident-severity-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Zone</Label>
            <Select value={form.zone_id} onValueChange={(v) => set("zone_id", v)}>
              <SelectTrigger className="mt-1 h-10" data-testid="incident-zone-select"><SelectValue placeholder="Select zone" /></SelectTrigger>
              <SelectContent>
                {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Assign to</Label>
            <Input className="mt-1" value={form.assigned_to} onChange={(e) => set("assigned_to", e.target.value)} placeholder="e.g. Safety, Maintenance, a name" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} data-testid="incident-submit" className="bg-[color:var(--brand-navy)]">Create incident</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
