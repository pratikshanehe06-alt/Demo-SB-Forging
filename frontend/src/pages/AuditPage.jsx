import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { ScrollText, Filter } from "lucide-react";

const ACTION_LABEL = {
  "module.toggle": { label: "Module toggled", color: "bg-blue-50 text-blue-700 border-blue-200" },
  "user.create": { label: "User created", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "user.update": { label: "User updated", color: "bg-amber-50 text-amber-700 border-amber-200" },
  "user.deactivate": { label: "User deactivated", color: "bg-slate-100 text-slate-700 border-slate-300" },
  "user.assign": { label: "Machine assigned", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  "alarm.ack": { label: "Alarm acknowledged", color: "bg-purple-50 text-purple-700 border-purple-200" },
  "tenant.create": { label: "Tenant created", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  "tenant.delete": { label: "Tenant deleted", color: "bg-red-50 text-red-700 border-red-200" },
};

export default function AuditPage() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  async function load() {
    const params = { limit: 200 };
    if (q) params.q = q;
    if (action !== "all") params.action = action;
    const { data } = await api.get("/audit-logs", { params });
    setRows(data);
  }

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, action]);

  return (
    <div className="space-y-4" data-testid="audit-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-[color:var(--brand-navy)]" /> Audit & Compliance
        </h1>
        <p className="text-sm text-slate-500">Every configuration change, machine assignment and alarm acknowledgement — searchable.</p>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Filter className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="audit-search" placeholder="Search user / entity id / action…"
              className="pl-9 h-9 bg-white" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-56 h-9 bg-white" data-testid="audit-action-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All actions</SelectItem>
              {Object.keys(ACTION_LABEL).map((k) => <SelectItem key={k} value={k}>{ACTION_LABEL[k].label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto text-xs text-slate-500">{rows.length} events</div>
        </div>

        <table className="w-full text-sm" data-testid="audit-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-3 px-2 font-semibold">Time</th>
              <th className="py-3 px-2 font-semibold">User</th>
              <th className="py-3 px-2 font-semibold">Role</th>
              <th className="py-3 px-2 font-semibold">Action</th>
              <th className="py-3 px-2 font-semibold">Entity</th>
              <th className="py-3 px-2 font-semibold">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = ACTION_LABEL[r.action] || { label: r.action, color: "bg-slate-50 text-slate-700 border-slate-200" };
              return (
                <tr key={r.id} className="data-row border-b last:border-0">
                  <td className="py-3 px-2 font-mono text-xs text-slate-600 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-3 px-2">
                    <div className="font-medium text-slate-800">{r.user_name}</div>
                    <div className="text-xs text-slate-500 font-mono">{r.user_email}</div>
                  </td>
                  <td className="py-3 px-2 text-xs text-slate-600">{r.role?.replace("_", " ")}</td>
                  <td className="py-3 px-2">
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="py-3 px-2">
                    <div className="text-slate-700">{r.entity || "—"}</div>
                    {r.entity_id && <div className="text-[10px] text-slate-400 font-mono">{r.entity_id.slice(0, 8)}…</div>}
                  </td>
                  <td className="py-3 px-2 font-mono text-xs text-slate-600 max-w-md truncate">
                    {r.details && Object.keys(r.details).length ? JSON.stringify(r.details) : "—"}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-500">No audit events match filters</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
