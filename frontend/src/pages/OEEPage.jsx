import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePlant } from "@/lib/plantContext";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  LineChart, Line, CartesianGrid, Legend, RadialBarChart, RadialBar, PolarAngleAxis
} from "recharts";
import { Activity, Target, ShieldCheck, Gauge, Clock } from "lucide-react";

const RANGE_DAYS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
];

export default function OEEPage() {
  const { params, selectedPlantId } = usePlant();
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get("/oee/summary", { params: { ...params, days } });
        setData(data);
      } catch (_) { setData(null); }
    }
    load();
    // eslint-disable-next-line
  }, [days, selectedPlantId]);

  if (!data) return <div className="text-slate-500">Loading OEE…</div>;

  const o = data.overall;
  const gaugeData = [
    { name: "Availability", value: o.availability, fill: "#1e3a8a" },
    { name: "Performance", value: o.performance, fill: "#0891b2" },
    { name: "Quality", value: o.quality, fill: "#22c55e" },
  ];

  return (
    <div className="space-y-6" data-testid="oee-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">OEE Dashboard</h1>
          <p className="text-sm text-slate-500">Availability × Performance × Quality across every line</p>
        </div>
        <div className="flex gap-1 bg-white border border-[color:var(--border)] rounded-md p-1">
          {RANGE_DAYS.map((r) => (
            <button key={r.value} data-testid={`oee-range-${r.value}`}
              onClick={() => setDays(r.value)}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${days === r.value ? "bg-[color:var(--brand-navy)] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Big OEE score + component gauges */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 grid place-items-center relative">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Overall OEE</div>
          <div className="w-40 h-40 relative">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
              <circle cx="50" cy="50" r="42" fill="none" strokeWidth="10" strokeLinecap="round"
                stroke={o.oee >= 75 ? "#22c55e" : o.oee >= 55 ? "#f59e0b" : "#ef4444"}
                strokeDasharray={`${(o.oee/100)*264} 264`} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="text-4xl font-mono font-bold tabular">{o.oee}<span className="text-lg text-slate-500">%</span></div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">OEE</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-slate-800 mb-4">A × P × Q</h3>
          <ResponsiveContainer width="100%" height={200}>
            <RadialBarChart innerRadius="30%" outerRadius="100%" data={gaugeData} startAngle={210} endAngle={-30}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background dataKey="value" cornerRadius={6} />
              <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v, entry) => `${v} — ${entry.payload.value}%`} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-3">Totals ({data.totals.days}d)</h3>
          <div className="space-y-2 text-sm">
            <TotalRow label="Produced" value={data.totals.produced.toLocaleString()} color="text-slate-900" />
            <TotalRow label="Good" value={data.totals.good.toLocaleString()} color="text-emerald-700" />
            <TotalRow label="Reject" value={data.totals.reject.toLocaleString()} color="text-red-700" />
            <TotalRow label="Downtime" value={`${data.totals.downtime_min} min`} color="text-amber-700" />
          </div>
        </div>
      </div>

      {/* OEE trend + downtime reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-slate-800 mb-3">OEE trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.trend}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="availability" name="Availability" stroke="#1e3a8a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="performance" name="Performance" stroke="#0891b2" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="quality" name="Quality" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="oee" name="OEE" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-3">Downtime by reason</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.downtime_breakdown} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="reason" type="category" width={120} tick={{ fontSize: 11, fill: "#475569" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Bar dataKey="minutes" fill="#ef4444" radius={[0,4,4,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Line leaderboard */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <h3 className="font-display font-semibold text-slate-800 mb-3">Lines leaderboard</h3>
        <table className="w-full text-sm" data-testid="oee-lines-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-3 px-2 font-semibold">Line</th>
              <th className="py-3 px-2 font-semibold text-right">Availability</th>
              <th className="py-3 px-2 font-semibold text-right">Performance</th>
              <th className="py-3 px-2 font-semibold text-right">Quality</th>
              <th className="py-3 px-2 font-semibold text-right">OEE</th>
              <th className="py-3 px-2 font-semibold text-right">Produced</th>
              <th className="py-3 px-2 font-semibold text-right">Downtime</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.line_id} className="data-row border-b last:border-0">
                <td className="py-3 px-2 font-medium text-slate-800">{l.line_name}</td>
                <td className="py-3 px-2 text-right font-mono tabular">{l.availability}%</td>
                <td className="py-3 px-2 text-right font-mono tabular">{l.performance}%</td>
                <td className="py-3 px-2 text-right font-mono tabular">{l.quality}%</td>
                <td className="py-3 px-2 text-right">
                  <span className={`font-mono font-bold ${l.oee >= 75 ? "text-emerald-600" : l.oee >= 55 ? "text-amber-600" : "text-red-600"}`}>
                    {l.oee}%
                  </span>
                </td>
                <td className="py-3 px-2 text-right font-mono tabular">{l.produced}</td>
                <td className="py-3 px-2 text-right font-mono tabular">{l.downtime_min}m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TotalRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}
