import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusPill, SeverityBadge } from "@/components/Pills";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line,
  PieChart, Pie, Cell
} from "recharts";
import { Boxes, Activity, PauseCircle, AlertTriangle, PowerOff, BellRing, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

const KPI_META = [
  { key: "total_assets", label: "Total Assets", icon: Boxes, color: "text-slate-700", bar: "bg-slate-100" },
  { key: "running", label: "Running", icon: Activity, color: "text-emerald-700", bar: "bg-emerald-100" },
  { key: "idle", label: "Idle", icon: PauseCircle, color: "text-amber-700", bar: "bg-amber-100" },
  { key: "fault", label: "Fault", icon: AlertTriangle, color: "text-red-700", bar: "bg-red-100" },
  { key: "offline", label: "Offline", icon: PowerOff, color: "text-slate-600", bar: "bg-slate-200" },
  { key: "active_alarms", label: "Active Alarms", icon: BellRing, color: "text-blue-700", bar: "bg-blue-100" },
];

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let t;
    async function load() {
      try {
        const { data } = await api.get("/dashboard/summary");
        setData(data);
      } catch (_) { /* ignore */ }
      t = setTimeout(load, 15000);
    }
    load();
    return () => clearTimeout(t);
  }, []);

  if (!data) {
    return <div className="text-slate-500">Loading dashboard…</div>;
  }

  const pieData = [
    { name: "Healthy", value: data.health_overview.healthy, color: "#22c55e" },
    { name: "Warning", value: data.health_overview.warning, color: "#f59e0b" },
    { name: "Critical", value: data.health_overview.critical, color: "#ef4444" },
    { name: "Offline", value: data.health_overview.offline, color: "#94a3b8" },
  ];

  return (
    <div className="space-y-6" data-testid="tenant-dashboard">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Tenant Admin Dashboard</h1>
        <p className="text-sm text-slate-500">Live operational overview across all plants</p>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_META.map((m) => (
          <div key={m.key} data-testid={`kpi-${m.key}`} className="bg-white rounded-lg border border-[color:var(--border)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{m.label}</span>
              <m.icon className={`h-4 w-4 ${m.color}`} />
            </div>
            <div className="mt-2 text-3xl font-mono font-bold tabular text-slate-900">
              {data.kpis[m.key]}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs">
              {m.key === "total_assets" && <><TrendingUp className="h-3 w-3 text-emerald-600" /><span className="text-emerald-700 font-semibold">+6%</span></>}
              {m.key === "running" && <span className="text-slate-500">({Math.round((data.kpis.running / (data.kpis.total_assets || 1)) * 100)}%)</span>}
              {m.key === "idle" && <span className="text-slate-500">({Math.round((data.kpis.idle / (data.kpis.total_assets || 1)) * 100)}%)</span>}
              {m.key === "fault" && <span className="text-slate-500">({Math.round((data.kpis.fault / (data.kpis.total_assets || 1)) * 100)}%)</span>}
              {m.key === "offline" && <span className="text-slate-500">({Math.round((data.kpis.offline / (data.kpis.total_assets || 1)) * 100)}%)</span>}
              {m.key === "active_alarms" && <span className="text-red-600 font-semibold">Critical {data.kpis.critical_alarms}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">Assets by Area</h3>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={data.assets_by_area} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="area" type="category" width={110} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Bar dataKey="count" fill="#1e3a8a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">Asset Health Overview</h3>
          </div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="55%" height={190}>
              <PieChart>
                <Pie data={pieData} innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value">
                  {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              <div className="mb-2">
                <div className="text-2xl font-mono font-bold text-slate-900">{data.health_overview.average}%</div>
                <div className="text-xs text-slate-500">Average Health</div>
              </div>
              {pieData.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-slate-600">{p.name}</span>
                  </div>
                  <span className="font-mono text-slate-800">({p.value})</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-800">Alarms Trend</h3>
            <span className="text-xs text-slate-500">Last 7 Days</span>
          </div>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={data.alarms_trend}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="count" stroke="#1e3a8a" strokeWidth={2} dot={{ r: 3, fill: "#1e3a8a" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-semibold text-slate-800">Recent Alarms</h3>
            <Link to="/assets" className="text-xs text-[color:var(--brand-blue)] font-semibold hover:underline">View all</Link>
          </div>
          <table className="w-full text-sm" data-testid="recent-alarms">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-2 font-semibold">Time</th>
                <th className="py-2 font-semibold">Asset</th>
                <th className="py-2 font-semibold">Message</th>
                <th className="py-2 font-semibold text-right">Severity</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_alarms.map((a) => (
                <tr key={a.id} className="data-row border-b last:border-0">
                  <td className="py-2.5 font-mono text-xs text-slate-600">
                    {(() => { try { return format(new Date(a.created_at), "HH:mm"); } catch (_) { return "--:--"; } })()}
                  </td>
                  <td className="py-2.5 font-medium text-slate-800">{a.asset_code}</td>
                  <td className="py-2.5 text-slate-600">{a.message}</td>
                  <td className="py-2.5 text-right"><SeverityBadge severity={a.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-3">Top Faulty Assets</h3>
          <div className="space-y-2">
            {data.top_faulty_assets.map((a) => (
              <Link to={`/assets/${a.id}`} key={a.id} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-200">
                <div>
                  <div className="font-medium text-slate-800 text-sm">{a.asset_code}</div>
                  <StatusPill status={a.status} className="mt-1" />
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-lg text-red-600">{a.health}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Health</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
