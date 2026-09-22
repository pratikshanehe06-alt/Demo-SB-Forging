import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, UserCheck, TrendingUp, Clock } from "lucide-react";

function KpiCard({ icon: Icon, label, value, color = "text-[color:var(--brand-navy)]" }) {
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

export default function WorkforcePage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/workforce/summary").then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4" data-testid="workforce-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Digital Workforce</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, shifts, recent_logs } = data;

  return (
    <div className="space-y-4" data-testid="workforce-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Digital Workforce</h1>
        <p className="text-sm text-slate-500">Shift attendance and workforce productivity across plants.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Planned Headcount" value={kpis.headcount_planned} />
        <KpiCard icon={UserCheck} label="Present" value={kpis.headcount_present} color="text-emerald-600" />
        <KpiCard icon={UserCheck} label="Attendance" value={`${kpis.attendance_pct}%`} />
        <KpiCard icon={TrendingUp} label="Avg Productivity" value={`${kpis.avg_productivity}%`} />
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="font-semibold text-sm text-slate-800 mb-3">Shift Attendance</div>
        <div className="space-y-2">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="text-sm text-slate-600 w-56 truncate">{s.name}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-[color:var(--brand-navy)] rounded-full" style={{ width: `${(s.headcount_present / s.headcount_planned) * 100}%` }} />
              </div>
              <span className="text-xs font-mono text-slate-500 w-16 text-right">{s.headcount_present}/{s.headcount_planned}</span>
            </div>
          ))}
          {shifts.length === 0 && <div className="text-xs text-slate-400">No shifts configured.</div>}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">Recent Clock-ins</span>
        </div>
        <table className="w-full text-sm" data-testid="workforce-logs-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">Employee</th>
              <th className="py-2 px-2 font-semibold">Role</th>
              <th className="py-2 px-2 font-semibold">Shift</th>
              <th className="py-2 px-2 font-semibold">Clock In</th>
              <th className="py-2 px-2 font-semibold">Productivity</th>
            </tr>
          </thead>
          <tbody>
            {recent_logs.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="py-2 px-2 font-medium text-slate-800">{l.employee_name}</td>
                <td className="py-2 px-2 text-slate-600">{l.role}</td>
                <td className="py-2 px-2 text-xs text-slate-500">{l.shift_name}</td>
                <td className="py-2 px-2 text-xs text-slate-500">{new Date(l.clock_in).toLocaleString()}</td>
                <td className="py-2 px-2 font-mono">{l.productivity_score}%</td>
              </tr>
            ))}
            {recent_logs.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-sm text-slate-400">No logs recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
