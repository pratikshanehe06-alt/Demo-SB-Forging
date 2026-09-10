import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function ThresholdEditor({ assetId }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState({});
  const [th, setTh] = useState({ temperature: { warning: "", critical: "" }, vibration: { warning: "", critical: "" } });
  const canEdit = ["TENANT_ADMIN", "PRODUCTION_MANAGER"].includes(user?.role);

  async function load() {
    const { data } = await api.get(`/assets/${assetId}/thresholds`);
    setDefaults(data.defaults);
    const cur = data.thresholds || {};
    setTh({
      temperature: { warning: cur.temperature?.warning ?? "", critical: cur.temperature?.critical ?? "" },
      vibration: { warning: cur.vibration?.warning ?? "", critical: cur.vibration?.critical ?? "" },
    });
  }
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, assetId]);

  function setField(metric, band, v) {
    setTh((t) => ({ ...t, [metric]: { ...t[metric], [band]: v } }));
  }

  function applyDefault(metric) {
    setTh((t) => ({ ...t, [metric]: { warning: defaults[metric]?.warning ?? "", critical: defaults[metric]?.critical ?? "" } }));
  }

  async function save() {
    const payload = {};
    for (const k of ["temperature", "vibration"]) {
      const w = parseFloat(th[k].warning);
      const c = parseFloat(th[k].critical);
      if (!isNaN(w) && !isNaN(c)) {
        if (w > c) { toast.error(`${k}: warning must be ≤ critical`); return; }
        payload[k] = { warning: w, critical: c };
      } else if (th[k].warning === "" && th[k].critical === "") {
        // skip = clear this metric
      } else {
        toast.error(`Set both bands for ${k} or leave both empty`); return;
      }
    }
    try {
      await api.put(`/assets/${assetId}/thresholds`, payload);
      toast.success("Thresholds saved");
      setOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Save failed");
    }
  }

  if (!canEdit) return null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="thresholds-btn">
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1" /> Thresholds
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Alarm Thresholds</DialogTitle></DialogHeader>
          <div className="text-xs text-slate-500 pb-2">
            Values above <span className="font-semibold text-amber-700">warning</span> mark the asset as WARNING; above <span className="font-semibold text-red-700">critical</span> mark it as CRITICAL. Leave both blank to fall back to platform defaults.
          </div>
          <MetricBand label="Temperature (°C)" defaults={defaults.temperature} band={th.temperature} onChange={(b,v)=>setField("temperature",b,v)} onReset={()=>applyDefault("temperature")} testidPrefix="temp" />
          <MetricBand label="Vibration (mm/s)" defaults={defaults.vibration} band={th.vibration} onChange={(b,v)=>setField("vibration",b,v)} onReset={()=>applyDefault("vibration")} testidPrefix="vib" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-testid="thresholds-save" onClick={save} className="bg-[color:var(--brand-navy)]">Save thresholds</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MetricBand({ label, defaults, band, onChange, onReset, testidPrefix }) {
  return (
    <div className="border rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <button type="button" onClick={onReset} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
          <RotateCcw className="h-3 w-3" /> Use default {defaults?.warning}/{defaults?.critical}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-amber-700">Warning</Label>
          <Input data-testid={`${testidPrefix}-warning`} type="number" step="0.1" value={band.warning} onChange={(e) => onChange("warning", e.target.value)} className="mt-1 font-mono" />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-red-700">Critical</Label>
          <Input data-testid={`${testidPrefix}-critical`} type="number" step="0.1" value={band.critical} onChange={(e) => onChange("critical", e.target.value)} className="mt-1 font-mono" />
        </div>
      </div>
    </div>
  );
}
