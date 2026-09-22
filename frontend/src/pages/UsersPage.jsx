import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserCog, UserPlus, Pencil, UserX, Wrench, ShieldCheck } from "lucide-react";

const ROLE_LABEL = {
  TENANT_ADMIN: "Tenant Admin",
  CXO: "CXO",
  PRODUCTION_MANAGER: "Production Manager",
  SUPERVISOR: "Supervisor",
  OPERATOR: "Operator",
};
const ROLE_BADGE = {
  TENANT_ADMIN: "bg-indigo-50 text-indigo-700 border-indigo-200",
  CXO: "bg-purple-50 text-purple-700 border-purple-200",
  PRODUCTION_MANAGER: "bg-blue-50 text-blue-700 border-blue-200",
  SUPERVISOR: "bg-amber-50 text-amber-700 border-amber-200",
  OPERATOR: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [modules, setModules] = useState([]);
  const [assignTarget, setAssignTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    const [u, a, m] = await Promise.all([
      api.get("/users"),
      api.get("/assets").catch(() => ({ data: [] })),
      api.get("/modules").catch(() => ({ data: [] })),
    ]);
    setUsers(u.data); setAssets(a.data);
    setModules(m.data.filter((mod) => mod.enabled)); // only tenant-enabled modules are assignable
  }
  useEffect(() => { load(); }, []);

  const canAssign = ["TENANT_ADMIN", "SUPERVISOR"].includes(user?.role);
  const canManage = user?.role === "TENANT_ADMIN";

  async function deactivate(u) {
    if (!window.confirm(`Deactivate ${u.name}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User deactivated");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Delete failed"); }
  }

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">Manage tenant users. Supervisors and Tenant Admins can assign machines to operators.</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpenCreate(true)} data-testid="add-user-btn" className="bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)]">
            <UserPlus className="h-4 w-4 mr-1" /> Add user
          </Button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
        <table className="w-full text-sm" data-testid="users-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-3 px-2 font-semibold">Name</th>
              <th className="py-3 px-2 font-semibold">Email</th>
              <th className="py-3 px-2 font-semibold">Role</th>
              <th className="py-3 px-2 font-semibold">Employee</th>
              <th className="py-3 px-2 font-semibold">Module Access</th>
              <th className="py-3 px-2 font-semibold">Assigned Machine</th>
              <th className="py-3 px-2 font-semibold">Status</th>
              <th className="py-3 px-2 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`data-row border-b last:border-0 ${u.active === false ? "opacity-50" : ""}`} data-testid={`user-row-${u.email}`}>
                <td className="py-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-slate-100 grid place-items-center text-xs font-semibold text-slate-700">
                      {u.name?.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                    </div>
                    <div className="font-medium text-slate-900">{u.name}</div>
                  </div>
                </td>
                <td className="py-3 px-2 text-slate-700 font-mono text-xs">{u.email}</td>
                <td className="py-3 px-2">
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold ${ROLE_BADGE[u.role] || ""}`}>
                    {ROLE_LABEL[u.role] || u.role}
                  </span>
                </td>
                <td className="py-3 px-2 text-slate-600 font-mono text-xs">{u.employee_id || "—"}</td>
                <td className="py-3 px-2">
                  {!u.allowed_modules || u.allowed_modules.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                      <ShieldCheck className="h-3 w-3" /> Full access
                    </span>
                  ) : (
                    <span className="text-xs text-slate-600" title={u.allowed_modules.join(", ")}>
                      {u.allowed_modules.length} module{u.allowed_modules.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </td>
                <td className="py-3 px-2">
                  {u.role === "OPERATOR" ? (
                    u.assigned_asset ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-700 text-sm">
                        <Wrench className="h-3.5 w-3.5 text-slate-500" />
                        <span className="font-medium">{u.assigned_asset.asset_code}</span>
                      </span>
                    ) : <span className="text-slate-400 text-xs italic">unassigned</span>
                  ) : <span className="text-slate-400 text-xs">—</span>}
                </td>
                <td className="py-3 px-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.active === false ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-700"}`}>
                    {u.active === false ? "Inactive" : "Active"}
                  </span>
                </td>
                <td className="py-3 px-2 text-right space-x-1">
                  {u.role === "OPERATOR" && canAssign && u.active !== false && (
                    <Button size="sm" variant="outline" data-testid={`assign-${u.email}`} onClick={() => setAssignTarget(u)}>
                      <UserCog className="h-3.5 w-3.5 mr-1" /> Machine
                    </Button>
                  )}
                  {canManage && u.id !== user.id && (
                    <>
                      <Button size="sm" variant="outline" data-testid={`edit-${u.email}`} onClick={() => setEditTarget(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {u.active !== false && (
                        <Button size="sm" variant="outline" data-testid={`deactivate-${u.email}`} onClick={() => deactivate(u)} className="text-red-600 border-red-200 hover:bg-red-50">
                          <UserX className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AssignDialog open={!!assignTarget} target={assignTarget} assets={assets}
        onClose={() => setAssignTarget(null)} onSaved={() => { setAssignTarget(null); load(); }} />
      <CreateUserDialog open={openCreate} onOpenChange={setOpenCreate} modules={modules} onCreated={load} />
      <EditUserDialog target={editTarget} modules={modules} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
    </div>
  );
}

function AssignDialog({ open, target, assets, onClose, onSaved }) {
  const [assetId, setAssetId] = useState("none");
  useEffect(() => { setAssetId(target?.assigned_asset_id || "none"); }, [target]);
  async function save() {
    try {
      await api.put(`/users/${target.id}/assign`, { assigned_asset_id: assetId === "none" ? null : assetId });
      toast.success("Machine assigned"); onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Assignment failed"); }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Assign machine to {target?.name}</DialogTitle></DialogHeader>
        <div className="py-2">
          <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Machine</Label>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger data-testid="assign-machine-select" className="bg-white mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="bg-white max-h-72">
              <SelectItem value="none">— No machine —</SelectItem>
              {assets.map((a) => <SelectItem key={a.id} value={a.id}>{a.asset_code} · {a.asset_type}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="assign-save" onClick={save} className="bg-[color:var(--brand-navy)]">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModuleAccessPicker({ modules, restricted, setRestricted, selected, setSelected }) {
  const allSelected = modules.length > 0 && selected.length === modules.length;

  function toggleModule(key) {
    setSelected((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  }
  function toggleAll() {
    setSelected(allSelected ? [] : modules.map((m) => m.key));
  }

  return (
    <div className="col-span-2 border-t pt-3 mt-1">
      <div className="flex items-center justify-between mb-2">
        <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Module Access</Label>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <Checkbox
            data-testid="restrict-modules-toggle"
            checked={restricted}
            onCheckedChange={(v) => { setRestricted(v); if (!v) setSelected([]); }}
          />
          Restrict to selected modules
        </label>
      </div>
      {!restricted ? (
        <div className="text-xs text-slate-500 bg-slate-50 rounded-md px-3 py-2 flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Full access — sees every module enabled for this tenant.
        </div>
      ) : (
        <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1.5">
          <div className="flex items-center justify-between pb-1.5 border-b mb-1.5">
            <span className="text-[11px] text-slate-500">{selected.length} of {modules.length} selected</span>
            <button type="button" onClick={toggleAll} className="text-[11px] font-medium text-[color:var(--brand-blue)] hover:underline">
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          {modules.map((m) => (
            <label key={m.key} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer" data-testid={`module-option-${m.key.toLowerCase()}`}>
              <Checkbox checked={selected.includes(m.key)} onCheckedChange={() => toggleModule(m.key)} />
              <span className="text-slate-700">{m.name}</span>
            </label>
          ))}
          {modules.length === 0 && <div className="text-xs text-slate-400">No modules enabled for this tenant yet.</div>}
        </div>
      )}
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, modules, onCreated }) {
  const [form, setForm] = useState({ email: "", name: "", role: "OPERATOR", password: "", employee_id: "" });
  const [restricted, setRestricted] = useState(false);
  const [selectedModules, setSelectedModules] = useState([]);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.email || !form.name || !form.password) { toast.error("Name, email and password are required"); return; }
    if (restricted && selectedModules.length === 0) { toast.error("Select at least one module, or turn off restriction"); return; }
    try {
      await api.post("/users", { ...form, allowed_modules: restricted ? selectedModules : null });
      toast.success("User created");
      onOpenChange(false); onCreated();
      setForm({ email: "", name: "", role: "OPERATOR", password: "", employee_id: "" });
      setRestricted(false); setSelectedModules([]);
    } catch (e) { toast.error(e.response?.data?.detail || "Create failed"); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <F label="Full Name"><Input data-testid="new-user-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></F>
          <F label="Employee ID"><Input data-testid="new-user-empid" value={form.employee_id} onChange={(e) => set("employee_id", e.target.value)} /></F>
          <F label="Email"><Input data-testid="new-user-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></F>
          <F label="Password"><Input data-testid="new-user-password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} /></F>
          <F label="Role">
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger data-testid="new-user-role" className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <ModuleAccessPicker
            modules={modules} restricted={restricted} setRestricted={setRestricted}
            selected={selectedModules} setSelected={setSelectedModules}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button data-testid="new-user-submit" onClick={submit} className="bg-[color:var(--brand-navy)]">Create user</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ target, modules, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", role: "OPERATOR", employee_id: "", password: "" });
  const [restricted, setRestricted] = useState(false);
  const [selectedModules, setSelectedModules] = useState([]);

  useEffect(() => {
    if (target) {
      setForm({ name: target.name || "", role: target.role || "OPERATOR", employee_id: target.employee_id || "", password: "" });
      const hasRestriction = !!(target.allowed_modules && target.allowed_modules.length > 0);
      setRestricted(hasRestriction);
      setSelectedModules(hasRestriction ? target.allowed_modules : []);
    }
  }, [target]);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function save() {
    if (restricted && selectedModules.length === 0) { toast.error("Select at least one module, or turn off restriction"); return; }
    const payload = { name: form.name, role: form.role, employee_id: form.employee_id };
    if (form.password) payload.password = form.password;
    if (restricted) {
      payload.allowed_modules = selectedModules;
    } else {
      payload.clear_module_restriction = true;
    }
    try {
      await api.put(`/users/${target.id}`, payload);
      toast.success("User updated"); onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Update failed"); }
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit {target?.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <F label="Full Name"><Input data-testid="edit-user-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></F>
          <F label="Employee ID"><Input value={form.employee_id} onChange={(e) => set("employee_id", e.target.value)} /></F>
          <F label="Role">
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white">
                {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label="Reset Password (optional)"><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Leave blank to keep" /></F>
          <ModuleAccessPicker
            modules={modules} restricted={restricted} setRestricted={setRestricted}
            selected={selectedModules} setSelected={setSelectedModules}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="edit-user-save" onClick={save} className="bg-[color:var(--brand-navy)]">Save</Button>
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
