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
import { Wrench, Plus, CalendarClock, IndianRupee } from "lucide-react";
import { toast } from "sonner";

const TYPE_BADGE = {
  PREVENTIVE: "bg-blue-50 text-blue-700 border-blue-200",
  CORRECTIVE: "bg-red-50 text-red-700 border-red-200",
  PREDICTIVE: "bg-purple-50 text-purple-700 border-purple-200",
};

export default function MaintenancePanel({ assetId }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  async function load() {
    const { data } = await api.get(`/assets/${assetId}/maintenance`);
    setRows(data);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [assetId]);

  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-5" data-testid="maintenance-panel">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-slate-800 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[color:var(--brand-navy)]" /> Maintenance history
        </h3>
        <Button size="sm" onClick={() => setOpen(true)} data-testid="add-maint-btn" className="bg-[color:var(--brand-navy)]">
          <Plus className="h-3.5 w-3.5 mr-1" /> Log maintenance
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-slate-500 py-6 text-center">No maintenance records yet.</div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 border rounded-lg p-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${TYPE_BADGE[r.type] || "bg-slate-100 text-slate-600 border-slate-300"}`}>
                    {r.type}
                  </span>
                  <span className="font-medium text-slate-800">{r.description}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {new Date(r.performed_at).toLocaleDateString()}</span>
                  {r.next_due_at && <span className="inline-flex items-center gap-1">Next: {new Date(r.next_due_at).toLocaleDateString()}</span>}
                  {r.technician && <span>· {r.technician}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-slate-800 flex items-center gap-0.5">
                  <IndianRupee className="h-3.5 w-3.5" />{Number(r.cost_inr || 0).toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Cost</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddDialog open={open} onOpenChange={setOpen} assetId={assetId} onSaved={() => { setOpen(false); load(); }} />
    </div>
  );
}

function AddDialog({ open, onOpenChange, assetId, onSaved }) {
  const [form, setForm] = useState({ type: "PREVENTIVE", description: "", technician: "", cost_inr: 0, next_due_at: "" });
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  async function save() {
    if (!form.description) { toast.error("Description required"); return; }
    try {
      await api.post(`/assets/${assetId}/maintenance`, {
        ...form,
        cost_inr: Number(form.cost_inr) || 0,
        next_due_at: form.next_due_at ? new Date(form.next_due_at).toISOString() : null,
      });
      toast.success("Maintenance logged");
      onSaved();
      setForm({ type: "PREVENTIVE", description: "", technician: "", cost_inr: 0, next_due_at: "" });
    } catch (e) { toast.error(e.response?.data?.detail || "Save failed"); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Log maintenance activity</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <F label="Type">
            <Select value={form.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger data-testid="maint-type" className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="PREVENTIVE">Preventive</SelectItem>
                <SelectItem value="CORRECTIVE">Corrective</SelectItem>
                <SelectItem value="PREDICTIVE">Predictive</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Cost (₹)"><Input data-testid="maint-cost" type="number" min="0" step="0.01" value={form.cost_inr} onChange={(e) => set("cost_inr", e.target.value)} /></F>
          <F label="Description" span2><Input data-testid="maint-desc" value={form.description} onChange={(e) => set("description", e.target.value)} /></F>
          <F label="Technician"><Input value={form.technician} onChange={(e) => set("technician", e.target.value)} /></F>
          <F label="Next Due (date)"><Input type="date" value={form.next_due_at} onChange={(e) => set("next_due_at", e.target.value)} /></F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="maint-save" onClick={save} className="bg-[color:var(--brand-navy)]">Log</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, span2, children }) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
