import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { usePlant } from "@/lib/plantContext";
import {
  Zap, DollarSign, Leaf, TrendingUp, Activity, Sun, BatteryCharging
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line,
  CartesianGrid, Legend
} from "recharts";

const RANGES = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

export default function EEMSPage() {
  const { params, selectedPlantId } = usePlant();
  const [range, setRange] = useState("7d");
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get("/energy/summary", { params: { ...params, range } });
        setData(data);
      } catch (_) { setData(null); }
    }
    load();
    // eslint-disable-next-line
  }, [range, selectedPlantId]);

  if (!data) return <div className="text-slate-500">Loading energy data…</div>;
  const k = data.kpis;

  return (
    <div className="space-y-6" data-testid="eems-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Enterprise Energy Management</h1>
          <p className="text-sm text-slate-500">EMS · PQI · DERMS · Utility metering</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-40 bg-white h-9" data-testid="eems-range"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white">
            {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Energy" value={`${k.kwh.toLocaleString()}`} unit="kWh" icon={Zap} color="text-yellow-600" />
        <Kpi label="Cost" value={`₹${k.cost_inr.toLocaleString()}`} icon={DollarSign} color="text-emerald-600" />
        <Kpi label="Peak Demand" value={k.peak_kw} unit="kW" icon={TrendingUp} color="text-red-600" />
        <Kpi label="Carbon" value={`${(k.carbon_kg/1000).toFixed(1)}`} unit="tons" icon={Leaf} color="text-teal-600" />
        <Kpi label="Power Factor" value={k.avg_power_factor} icon={Activity} color="text-blue-600" />
        <Kpi label="THD" value={`${k.avg_thd}%`} icon={Activity} color="text-purple-600" />
        <Kpi label="Renewable" value={`${k.renewable_pct}%`} icon={Sun} color="text-amber-600" />
        <Kpi label="Days" value={k.days} icon={BatteryCharging} color="text-slate-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5 lg:col-span-2">
          <h3 className="font-display font-semibold text-slate-800 mb-4">Consumption & cost trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#64748b" }} unit=" kWh" width={70} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#10b981" }} unit=" ₹" width={80} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="kwh" name="kWh" stroke="#1e3a8a" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="cost" name="Cost (₹)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
          <h3 className="font-display font-semibold text-slate-800 mb-4">Power Factor trend</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis domain={[0.8, 1]} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
              <Line type="monotone" dataKey="power_factor" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <h3 className="font-display font-semibold text-slate-800 mb-4">Plant comparison (last 7 days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data.plant_comparison}>
            <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
            <XAxis dataKey="plant_name" tick={{ fontSize: 12, fill: "#475569" }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#1e3a8a" }} unit=" kWh" width={80} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#10b981" }} unit="%" />
            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="kwh" name="kWh" fill="#1e3a8a" radius={[4,4,0,0]} />
            <Bar yAxisId="right" dataKey="renewable_pct" name="Renewable %" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="mt-2 text-2xl font-mono font-bold tabular text-slate-900">
        {value}{unit && <span className="text-sm font-medium text-slate-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
