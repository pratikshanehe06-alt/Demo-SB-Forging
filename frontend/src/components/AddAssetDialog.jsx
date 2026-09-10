import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const ASSET_TYPES = [
  "Hydraulic Press", "Forging Hammer", "CNC Machine", "Induction Furnace",
  "Quench Tank", "Tempering Oven", "Air Compressor", "Water Chiller",
  "Cooling Tower", "Overhead Crane", "Conveyor",
];

export default function AddAssetDialog({ open, onOpenChange, onCreated }) {
  const [areas, setAreas] = useState([]);
  const [plants, setPlants] = useState([]);
  const [form, setForm] = useState({
    asset_code: "", name: "", asset_type: "CNC Machine",
    plant_id: "", area_id: "", manufacturer: "", model: "",
    serial: "", criticality: "MEDIUM", status: "OFFLINE", health: 100,
  });

  useEffect(() => {
    if (!open) return;
    api.get("/areas").then((r) => setAreas(r.data));
    api.get("/plants").then((r) => {
      setPlants(r.data);
      if (r.data[0]) setForm((f) => ({ ...f, plant_id: r.data[0].id }));
    });
  }, [open]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.asset_code || !form.area_id) {
      toast.error("Asset code and area are required");
      return;
    }
    try {
      await api.post("/assets", { ...form, health: Number(form.health) });
      toast.success(`Asset ${form.asset_code} created`);
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to create");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl">
        <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <F label="Asset Code"><Input data-testid="new-asset-code" value={form.asset_code} onChange={(e) => set("asset_code", e.target.value)} /></F>
          <F label="Asset Name"><Input data-testid="new-asset-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></F>
          <F label="Asset Type">
            <Select value={form.asset_type} onValueChange={(v) => set("asset_type", v)}>
              <SelectTrigger data-testid="new-asset-type" className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">{ASSET_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Plant">
            <Select value={form.plant_id} onValueChange={(v) => set("plant_id", v)}>
              <SelectTrigger className="bg-white"><SelectValue placeholder="Select plant" /></SelectTrigger>
              <SelectContent className="bg-white">{plants.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Area">
            <Select value={form.area_id} onValueChange={(v) => set("area_id", v)}>
              <SelectTrigger data-testid="new-asset-area" className="bg-white"><SelectValue placeholder="Select area" /></SelectTrigger>
              <SelectContent className="bg-white">{areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></F>
          <F label="Model"><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></F>
          <F label="Serial"><Input value={form.serial} onChange={(e) => set("serial", e.target.value)} /></F>
          <F label="Criticality">
            <Select value={form.criticality} onValueChange={(v) => set("criticality", v)}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                {["LOW", "MEDIUM", "HIGH"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                {["OFFLINE", "RUNNING", "IDLE", "FAULT"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} data-testid="new-asset-submit" className="bg-[color:var(--brand-navy)]">Create Asset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
