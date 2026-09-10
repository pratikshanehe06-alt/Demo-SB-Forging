import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePlant } from "@/lib/plantContext";
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, PolarRadiusAxis, Legend
} from "recharts";
import { TrendingUp, Zap, Leaf, AlertOctagon, Factory } from "lucide-react";

const PLANT_COLORS = ["#1e3a8a", "#0891b2", "#f59e0b"];

export default function CXOBoard() {
  const [plants, setPlants] = useState([]);
  const { selectedPlantId } = usePlant();

  useEffect(() => {
    async function load() {
      const { data } = await api.get("/dashboard/cxo-comparison");
      setPlants(data);
    }
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  if (plants.length === 0) return <div className="text-slate-500">Loading plants…</div>;

  const oeeChart = plants.map((p) => ({
    name: p.name.replace(" Plant", ""),
    OEE: p.oee, Availability: p.availability, Performance: p.performance, Quality: p.quality,
  }));
  const radarData = ["Availability", "Performance", "Quality", "Health", "Uptime"].map((metric) => {
    const obj = { metric };
    plants.forEach((p) => {
      const v = metric === "Availability" ? p.availability :
                metric === "Performance" ? p.performance :
                metric === "Quality" ? p.quality :
                metric === "Health" ? p.avg_health :
                p.running_pct;
      obj[p.name.replace(" Plant", "")] = v;
    });
    return obj;
  });

  const totals = plants.reduce((acc, p) => ({
    energy_kwh: acc.energy_kwh + p.energy_kwh,
    energy_cost_inr: acc.energy_cost_inr + p.energy_cost_inr,
    carbon_kg: acc.carbon_kg + p.carbon_kg,
    assets: acc.assets + p.total_assets,
    alarms: acc.alarms + p.active_alarms,
  }), { energy_kwh: 0, energy_cost_inr: 0, carbon_kg: 0, assets: 0, alarms: 0 });

  return (
    <div className="space-y-6" data-testid="cxo-board">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">CXO Comparison Board</h1>
        <p className="text-sm text-slate-500">Side-by-side operational KPIs across all plants</p>
      </div>

      {/* Fleet totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <FleetKpi label="Total Assets" value={totals.assets} icon={Factory} color="text-slate-700" />
        <FleetKpi label="Fleet Energy" value={`${totals.energy_kwh.toLocaleString()} kWh`} icon={Zap} color="text-yellow-600" />
        <FleetKpi label="Energy Spend" value={`₹${totals.energy_cost_inr.toLocaleString()}`} icon={TrendingUp} color="text-emerald-600" />
        <FleetKpi label="Carbon" value={`${totals.carbon_kg.toLocaleString()} kg`} icon={Leaf} color="text-teal-600" />
        <FleetKpi label="Active Alarms" value={totals.alarms} icon={AlertOctagon} color="text-red-600" />
      </div>

      {/* OEE breakdown chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-slate-800 mb-4">OEE breakdown by plant</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={oeeChart} barGap={6}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} unit="%" />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Availability" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Performance" fill="#0891b2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Quality" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="OEE" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-4">Multi-plant fingerprint</h3>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} outerRadius={90}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#475569" }} />
              <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
              {plants.map((p, i) => (
                <Radar key={p.plant_id} name={p.name.replace(" Plant", "")}
                  dataKey={p.name.replace(" Plant", "")}
                  stroke={PLANT_COLORS[i % PLANT_COLORS.length]} fill={PLANT_COLORS[i % PLANT_COLORS.length]} fillOpacity={0.15} />
              ))}
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <h3 className="font-display font-semibold text-slate-800 mb-3">Plant leaderboard</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="cxo-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-3 px-3 font-semibold">Rank</th>
                <th className="py-3 px-3 font-semibold">Plant</th>
                <th className="py-3 px-3 font-semibold text-right">Assets</th>
                <th className="py-3 px-3 font-semibold text-right">Health</th>
                <th className="py-3 px-3 font-semibold text-right">OEE</th>
                <th className="py-3 px-3 font-semibold text-right">Energy (kWh)</th>
                <th className="py-3 px-3 font-semibold text-right">Cost (₹)</th>
                <th className="py-3 px-3 font-semibold text-right">Alarms</th>
              </tr>
            </thead>
            <tbody>
              {plants.map((p, i) => (
                <tr key={p.plant_id} className={`data-row border-b last:border-0 ${selectedPlantId === p.plant_id ? "bg-blue-50/60 ring-1 ring-inset ring-[color:var(--brand-blue)]/40" : ""}`} data-testid={`cxo-row-${p.code}`}>
                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full font-mono font-bold text-xs ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-700" : "bg-orange-50 text-orange-700"}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-900">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.location} · {p.code}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular">{p.total_assets}</td>
                  <td className="py-3 px-3 text-right">
                    <span className={`font-mono font-bold ${p.avg_health >= 80 ? "text-emerald-600" : p.avg_health >= 60 ? "text-amber-600" : "text-red-600"}`}>{p.avg_health}%</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="font-mono font-bold text-[color:var(--brand-navy)]">{p.oee}%</span>
                    <div className="h-1 w-24 bg-slate-100 rounded-full mt-1 ml-auto overflow-hidden">
                      <div className="h-full bg-[color:var(--brand-navy)]" style={{ width: `${p.oee}%` }} />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular">{p.energy_kwh.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right font-mono tabular">₹{p.energy_cost_inr.toLocaleString()}</td>
                  <td className="py-3 px-3 text-right">
                    <span className={`font-mono font-bold ${p.active_alarms > 5 ? "text-red-600" : p.active_alarms > 0 ? "text-amber-600" : "text-emerald-600"}`}>{p.active_alarms}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
