import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { BellRing, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

const SEVERITY_TABS = ["ALL", "CRITICAL", "MAJOR", "MINOR"];

const SEVERITY_STYLES = {
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  MAJOR: "text-orange-700 bg-orange-50 border-orange-200",
  MINOR: "text-slate-600 bg-slate-50 border-slate-200",
};

export default function AlarmsPage() {
  const [alarms, setAlarms] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [showAcked, setShowAcked] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    const params = { limit: 200 };
    if (tab !== "ALL") params.severity = tab;
    if (!showAcked) params.acknowledged = false;
    const { data } = await api.get("/alarms", { params });
    setAlarms(data);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    load();
  }, [tab, showAcked]);

  async function acknowledge(id) {
    try {
      await api.post(`/alarms/${id}/acknowledge`);
      toast.success("Alarm acknowledged");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to acknowledge");
    }
  }

  return (
    <div className="space-y-4" data-testid="alarms-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Alarms & Events</h1>
        <p className="text-sm text-slate-500">Fleet-wide alarm feed with acknowledgement and severity filtering.</p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 border-b border-[color:var(--border)]">
          {SEVERITY_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setTab(s)}
              data-testid={`alarm-tab-${s.toLowerCase()}`}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === s ? "border-[color:var(--brand-navy)] text-[color:var(--brand-navy)]" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showAcked} onChange={(e) => setShowAcked(e.target.checked)} />
          Show acknowledged
        </label>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        {loading ? (
          <div className="text-sm text-slate-500">Loading alarms…</div>
        ) : (
          <table className="w-full text-sm" data-testid="alarms-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-2 px-2 font-semibold">Time</th>
                <th className="py-2 px-2 font-semibold">Asset</th>
                <th className="py-2 px-2 font-semibold">Message</th>
                <th className="py-2 px-2 font-semibold">Severity</th>
                <th className="py-2 px-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {alarms.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 px-2 text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {new Date(a.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 px-2">
                    <Link to={`/assets/${a.asset_id}`} className="font-medium text-[color:var(--brand-navy)] hover:underline">
                      {a.asset_code}
                    </Link>
                  </td>
                  <td className="py-2 px-2 text-slate-700">{a.message}</td>
                  <td className="py-2 px-2">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.MINOR}`}>
                      {a.severity}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right">
                    {a.acknowledged ? (
                      <span className="text-xs text-slate-400 flex items-center justify-end gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Acknowledged
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => acknowledge(a.id)} data-testid={`ack-alarm-${a.id}`}>
                        <BellRing className="h-3.5 w-3.5 mr-1" /> Acknowledge
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {alarms.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">No alarms for this filter.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
