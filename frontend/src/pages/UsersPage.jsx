import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { UserCog, Wrench } from "lucide-react";

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
  const [assignTarget, setAssignTarget] = useState(null);

  async function load() {
    const [u, a] = await Promise.all([
      api.get("/users"),
      api.get("/assets"),
    ]);
    setUsers(u.data);
    setAssets(a.data);
  }
  useEffect(() => { load(); }, []);

  const canAssign = ["TENANT_ADMIN", "SUPERVISOR"].includes(user?.role);

  return (
    <div className="space-y-4" data-testid="users-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Users</h1>
        <p className="text-sm text-slate-500">Manage tenant users. Supervisors and Tenant Admins can assign machines to operators.</p>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
        <table className="w-full text-sm" data-testid="users-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-3 px-2 font-semibold">Name</th>
              <th className="py-3 px-2 font-semibold">Email</th>
              <th className="py-3 px-2 font-semibold">Role</th>
              <th className="py-3 px-2 font-semibold">Employee ID</th>
              <th className="py-3 px-2 font-semibold">Assigned Machine</th>
              <th className="py-3 px-2 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="data-row border-b last:border-0" data-testid={`user-row-${u.email}`}>
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
                  {u.role === "OPERATOR" ? (
                    u.assigned_asset ? (
                      <span className="inline-flex items-center gap-1.5 text-slate-700 text-sm">
                        <Wrench className="h-3.5 w-3.5 text-slate-500" />
                        <span className="font-medium">{u.assigned_asset.asset_code}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs italic">unassigned</span>
                    )
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>
                <td className="py-3 px-2 text-right">
                  {u.role === "OPERATOR" && canAssign ? (
                    <Button size="sm" variant="outline" data-testid={`assign-${u.email}`} onClick={() => setAssignTarget(u)}>
                      <UserCog className="h-3.5 w-3.5 mr-1" />
                      Assign machine
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AssignDialog
        open={!!assignTarget}
        target={assignTarget}
        assets={assets}
        onClose={() => setAssignTarget(null)}
        onSaved={() => { setAssignTarget(null); load(); }}
      />
    </div>
  );
}

function AssignDialog({ open, target, assets, onClose, onSaved }) {
  const [assetId, setAssetId] = useState(target?.assigned_asset_id || "");
  useEffect(() => { setAssetId(target?.assigned_asset_id || "none"); }, [target]);

  async function save() {
    try {
      await api.put(`/users/${target.id}/assign`, { assigned_asset_id: assetId === "none" ? null : assetId });
      toast.success("Machine assigned");
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Assignment failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-white">
        <DialogHeader><DialogTitle>Assign machine to {target?.name}</DialogTitle></DialogHeader>
        <div className="py-2">
          <div className="text-xs uppercase tracking-wider font-semibold text-slate-600 mb-2">Machine</div>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger data-testid="assign-machine-select" className="bg-white"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent className="bg-white max-h-72">
              <SelectItem value="none">— No machine —</SelectItem>
              {assets.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.asset_code} · {a.asset_type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-slate-500 mt-3">The operator's runbook will re-target this machine on their next login.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="assign-save" onClick={save} className="bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)]">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
