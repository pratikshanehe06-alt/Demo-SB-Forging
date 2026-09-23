import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Building2, Plus, LogOut, Users, Boxes, MapPin, Trash2, ShieldCheck,
  LayoutTemplate, Search, Pencil, Eye, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const TEMPLATE_LABELS = { APM: "Asset Performance Management", FIRE_SAFETY: "Fire & Safety", BOTH: "APM + Fire & Safety" };
const TEMPLATE_BADGE_STYLES = {
  APM: "text-indigo-700 bg-indigo-50 border-indigo-200",
  FIRE_SAFETY: "text-red-700 bg-red-50 border-red-200",
  BOTH: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export default function PlatformAdmin() {
  const { user, logout, tenant } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openAdd, setOpenAdd] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function load() {
    const { data } = await api.get("/platform/tenants");
    setTenants(data);
  }
  useEffect(() => { load(); }, []);

  const visible = tenants.filter((t) => {
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.code.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? t.active !== false : t.active === false);
    return matchesSearch && matchesStatus;
  });

  async function confirmDelete() {
    try {
      await api.delete(`/platform/tenants/${deleteTarget.id}`);
      toast.success(`Deleted ${deleteTarget.name}`);
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed");
    }
  }

  async function toggleStatus(t) {
    try {
      await api.put(`/platform/tenants/${t.id}`, { active: t.active === false });
      toast.success(`${t.name} ${t.active === false ? "activated" : "deactivated"}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--workspace)]" data-testid="platform-admin">
      <header className="h-16 bg-[color:var(--brand-navy)] text-white flex items-center px-6">
        <div className="flex items-center gap-2 mr-6">
          <div className="h-8 w-8 rounded-md bg-white/10 border border-white/20 grid place-items-center font-display font-black">C</div>
          <span className="font-display font-bold text-lg">CoreOT<sup className="text-[10px]">™</sup></span>
          <span className="ml-3 text-xs uppercase tracking-wider bg-yellow-400/20 text-yellow-100 border border-yellow-300/40 px-2 py-1 rounded flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Platform Super Admin
          </span>
        </div>
        <div className="flex-1" />
        <div className="text-sm mr-4 text-right">
          <div className="font-medium">{user?.name}</div>
          <div className="text-[10px] text-white/70">{user?.email}</div>
        </div>
        <button onClick={() => { logout(); navigate("/login"); }} data-testid="platform-logout" className="h-9 px-3 rounded-md hover:bg-white/10 flex items-center gap-1 text-sm">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display font-black text-3xl text-slate-900">Tenants</h1>
            <p className="text-sm text-slate-500">Provision, monitor and retire tenant organizations on the CoreOT platform.</p>
          </div>
          <Button onClick={() => setOpenAdd(true)} data-testid="add-tenant-btn" className="bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)] h-11">
            <Plus className="h-4 w-4 mr-1" /> New tenant
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <FleetKpi label="Tenants" value={tenants.length} icon={Building2} color="text-[color:var(--brand-navy)]" />
          <FleetKpi label="Users" value={tenants.reduce((a, t) => a + t.users_count, 0)} icon={Users} color="text-indigo-600" />
          <FleetKpi label="Plants" value={tenants.reduce((a, t) => a + t.plants_count, 0)} icon={MapPin} color="text-emerald-600" />
          <FleetKpi label="Assets" value={tenants.reduce((a, t) => a + t.assets_count, 0)} icon={Boxes} color="text-amber-600" />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="tenant-search"
              placeholder="Search by name or code…"
              className="pl-9 h-10 bg-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger data-testid="tenant-status-filter" className="w-40 h-10 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active only</SelectItem>
              <SelectItem value="inactive">Inactive only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <table className="w-full text-sm" data-testid="tenants-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-3 px-2 font-semibold">Tenant</th>
                <th className="py-3 px-2 font-semibold">Code</th>
                <th className="py-3 px-2 font-semibold">Template</th>
                <th className="py-3 px-2 font-semibold">Status</th>
                <th className="py-3 px-2 font-semibold text-right">Users</th>
                <th className="py-3 px-2 font-semibold text-right">Plants</th>
                <th className="py-3 px-2 font-semibold text-right">Assets</th>
                <th className="py-3 px-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className={`data-row border-b last:border-0 ${t.active === false ? "opacity-60" : ""}`} data-testid={`tenant-row-${t.code}`}>
                  <td className="py-3 px-2 font-semibold text-slate-900">{t.name}</td>
                  <td className="py-3 px-2 font-mono text-xs text-slate-600">{t.code}</td>
                  <td className="py-3 px-2">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${TEMPLATE_BADGE_STYLES[t.template] || "text-slate-600 bg-slate-50 border-slate-200"}`}>
                      {TEMPLATE_LABELS[t.template] || t.template || "APM"}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <button
                      onClick={() => t.code !== "PLATFORM" && toggleStatus(t)}
                      disabled={t.code === "PLATFORM"}
                      data-testid={`tenant-status-toggle-${t.code}`}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        t.active === false ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"
                      } ${t.code !== "PLATFORM" ? "hover:opacity-75 cursor-pointer" : "cursor-default"}`}
                      title={t.code === "PLATFORM" ? "" : "Click to toggle status"}
                    >
                      {t.active === false ? "Inactive" : "Active"}
                    </button>
                  </td>
                  <td className="py-3 px-2 text-right font-mono tabular">{t.users_count}</td>
                  <td className="py-3 px-2 text-right font-mono tabular">{t.plants_count}</td>
                  <td className="py-3 px-2 text-right font-mono tabular">{t.assets_count}</td>
                  <td className="py-3 px-2 text-right space-x-1">
                    <Button size="sm" variant="outline" data-testid={`view-tenant-${t.code}`} onClick={() => setViewTarget(t)}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {t.code !== "PLATFORM" && (
                      <>
                        <Button size="sm" variant="outline" data-testid={`edit-tenant-${t.code}`} onClick={() => setEditTarget(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setDeleteTarget(t)} data-testid={`delete-tenant-${t.code}`} className="text-red-600 border-red-200 hover:bg-red-50">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">No tenants match this filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <AddTenantDialog open={openAdd} onOpenChange={setOpenAdd} onCreated={load} />
      <ViewTenantDialog target={viewTarget} onClose={() => setViewTarget(null)} />
      <EditTenantDialog target={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      <DeleteTenantDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
    </div>
  );
}

function AddTenantDialog({ open, onOpenChange, onCreated }) {
  const [form, setForm] = useState({ code: "", name: "", admin_email: "", admin_name: "", admin_password: "", template: "APM" });
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    for (const k of ["code", "name", "admin_email", "admin_name", "admin_password"]) {
      if (!form[k]) { toast.error(`${k} is required`); return; }
    }
    try {
      await api.post("/platform/tenants", form);
      toast.success(`Tenant ${form.code} created (${TEMPLATE_LABELS[form.template]})`);
      onOpenChange(false);
      onCreated();
      setForm({ code: "", name: "", admin_email: "", admin_name: "", admin_password: "", template: "APM" });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Create failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Provision new tenant</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <F label="Tenant Code" hint="e.g. ACME"><Input data-testid="new-tenant-code" value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} /></F>
          <F label="Tenant Name"><Input data-testid="new-tenant-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></F>

          <div className="col-span-2">
            <F label="Template" hint="Determines which modules are enabled for this tenant">
              <Select value={form.template} onValueChange={(v) => set("template", v)}>
                <SelectTrigger data-testid="new-tenant-template" className="h-10">
                  <div className="flex items-center gap-2">
                    <LayoutTemplate className="h-4 w-4 text-slate-400" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APM" data-testid="template-option-apm">
                    <div><div className="font-medium">Asset Performance Management</div><div className="text-xs text-slate-500">Industrial assets, telemetry, OEE, energy</div></div>
                  </SelectItem>
                  <SelectItem value="FIRE_SAFETY" data-testid="template-option-fire">
                    <div><div className="font-medium">Fire & Safety Command Center</div><div className="text-xs text-slate-500">Zones, hydrants, sprinklers, fire pumps, tanks</div></div>
                  </SelectItem>
                  <SelectItem value="BOTH" data-testid="template-option-both">
                    <div><div className="font-medium">Both</div><div className="text-xs text-slate-500">Full APM + Fire & Safety modules enabled</div></div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </F>
          </div>

          <div className="col-span-2 border-t pt-3 mt-1 text-[11px] uppercase tracking-wider font-semibold text-slate-500">Initial Tenant Admin</div>
          <F label="Admin Name"><Input value={form.admin_name} onChange={(e) => set("admin_name", e.target.value)} /></F>
          <F label="Admin Email"><Input type="email" value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} /></F>
          <F label="Admin Password"><Input type="password" value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} /></F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="new-tenant-submit" onClick={submit} className="bg-[color:var(--brand-navy)]">Create tenant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewTenantDialog({ target, onClose }) {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    if (target) {
      setDetails(null);
      api.get(`/platform/tenants/${target.id}`).then((r) => setDetails(r.data)).catch(() => setDetails(target));
    }
  }, [target]);

  if (!target) return null;
  const d = details || target;

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{d.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-[11px] uppercase text-slate-500 font-semibold">Code</p><p className="font-mono mt-0.5">{d.code}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500 font-semibold">Status</p><p className="mt-0.5">{d.active === false ? "Inactive" : "Active"}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500 font-semibold">Template</p><p className="mt-0.5">{TEMPLATE_LABELS[d.template] || d.template || "—"}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500 font-semibold">Users</p><p className="mt-0.5 font-mono">{d.users_count ?? "—"}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500 font-semibold">Plants</p><p className="mt-0.5 font-mono">{d.plants_count ?? "—"}</p></div>
            <div><p className="text-[11px] uppercase text-slate-500 font-semibold">Assets</p><p className="mt-0.5 font-mono">{d.assets_count ?? "—"}</p></div>
          </div>

          {d.modules && (
            <div>
              <p className="text-[11px] uppercase text-slate-500 font-semibold mb-1.5">Enabled Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(d.modules).filter(([, v]) => v).map(([k]) => (
                  <span key={k} className="text-[10px] font-medium bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600">{k}</span>
                ))}
                {Object.values(d.modules).every((v) => !v) && <span className="text-xs text-slate-400">None enabled</span>}
              </div>
            </div>
          )}

          {d.admins && (
            <div>
              <p className="text-[11px] uppercase text-slate-500 font-semibold mb-1.5">Tenant Admins</p>
              <div className="space-y-1">
                {d.admins.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
                    <span className="text-slate-800">{a.name}</span>
                    <span className="text-xs text-slate-500 font-mono">{a.email}</span>
                  </div>
                ))}
                {d.admins.length === 0 && <span className="text-xs text-slate-400">No tenant admin found</span>}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTenantDialog({ target, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (target) { setName(target.name || ""); setActive(target.active !== false); }
  }, [target]);

  async function save() {
    if (!name.trim()) { toast.error("Tenant name is required"); return; }
    try {
      await api.put(`/platform/tenants/${target.id}`, { name, active });
      toast.success("Tenant updated");
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Edit {target?.name}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <F label="Tenant Name"><Input data-testid="edit-tenant-name" value={name} onChange={(e) => setName(e.target.value)} /></F>
          <F label="Status">
            <Select value={active ? "active" : "inactive"} onValueChange={(v) => setActive(v === "active")}>
              <SelectTrigger data-testid="edit-tenant-status" className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <p className="text-[11px] text-slate-400">Tenant code cannot be changed after creation.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="edit-tenant-save" onClick={save} className="bg-[color:var(--brand-navy)]">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTenantDialog({ target, onClose, onConfirm }) {
  const [confirmText, setConfirmText] = useState("");
  useEffect(() => { setConfirmText(""); }, [target]);

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-5 w-5" /> Delete tenant?
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-slate-600">
            This will permanently delete <span className="font-semibold text-slate-900">{target?.name}</span> and
            ALL of its data — users, plants, assets, alarms, telemetry and every module's records. This cannot be undone.
          </p>
          <div>
            <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">
              Type <span className="font-mono text-red-600">{target?.code}</span> to confirm
            </Label>
            <Input
              data-testid="delete-tenant-confirm-input"
              className="mt-1"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={target?.code}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            data-testid="delete-tenant-confirm-btn"
            onClick={onConfirm}
            disabled={confirmText !== target?.code}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, hint, children }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-[10px] text-slate-500 mt-1">{hint}</div>}
    </div>
  );
}

function FleetKpi({ label, value, icon: Icon, color }) {
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
