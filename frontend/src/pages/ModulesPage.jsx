import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Cpu, Zap, Boxes, Bot, FileBarChart2, ScrollText, GanttChart
} from "lucide-react";

const ICONS = {
  APM: Boxes, EEMS: Zap, DIGITAL_TWIN: Cpu, OEE_APS: GanttChart,
  AI_COPILOT: Bot, REPORTS: FileBarChart2, AUDIT: ScrollText,
};

export default function ModulesPage() {
  const { user, refreshModules } = useAuth();
  const [modules, setModulesState] = useState([]);
  const [saving, setSaving] = useState(null);

  async function load() {
    const { data } = await api.get("/modules");
    setModulesState(data);
  }
  useEffect(() => { load(); }, []);

  async function toggle(mod, next) {
    if (user?.role !== "TENANT_ADMIN") return;
    setSaving(mod.key);
    // optimistic
    setModulesState((ms) => ms.map((m) => m.key === mod.key ? { ...m, enabled: next } : m));
    try {
      await api.put(`/modules/${mod.key}`, { enabled: next });
      await refreshModules();
      toast.success(`${mod.name} ${next ? "enabled" : "disabled"}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Update failed");
      setModulesState((ms) => ms.map((m) => m.key === mod.key ? { ...m, enabled: !next } : m));
    } finally {
      setSaving(null);
    }
  }

  const canEdit = user?.role === "TENANT_ADMIN";

  return (
    <div className="space-y-4" data-testid="modules-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Module Activation</h1>
        <p className="text-sm text-slate-500">Enable or disable CoreOT modules for this tenant. Disabled modules are hidden from users and their APIs return 403. Your existing data is preserved.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((m) => {
          const Icon = ICONS[m.key] || Boxes;
          return (
            <div key={m.key} data-testid={`module-card-${m.key}`} className={`bg-white rounded-lg border p-5 transition-colors ${m.enabled ? "border-[color:var(--brand-navy)]/40" : "border-slate-200"}`}>
              <div className="flex items-start gap-4">
                <div className={`h-10 w-10 rounded-lg grid place-items-center ${m.enabled ? "bg-blue-50 text-[color:var(--brand-navy)]" : "bg-slate-100 text-slate-400"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display font-semibold text-slate-900">{m.name}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">{m.key}</div>
                    </div>
                    <Switch
                      data-testid={`module-toggle-${m.key}`}
                      checked={m.enabled}
                      disabled={!canEdit || saving === m.key}
                      onCheckedChange={(v) => toggle(m, v)}
                    />
                  </div>
                  <p className="text-sm text-slate-600 mt-2">{m.description}</p>
                  <div className="mt-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      m.enabled
                        ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                        : "bg-slate-100 text-slate-500 border-slate-300"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${m.enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                      {m.enabled ? "Active" : "Disabled"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!canEdit && (
        <div className="text-xs text-slate-500">Only Tenant Admin can change module state.</div>
      )}
    </div>
  );
}
