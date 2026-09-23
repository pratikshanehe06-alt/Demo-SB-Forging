import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Boxes, Zap, Settings, Sun, Activity, Droplet, Flame, Package,
  ClipboardCheck, UserCheck, IndianRupee, AlertTriangle,
} from "lucide-react";

function fmtInr(n) {
  if (n === undefined || n === null) return "—";
  return `₹${(n / 100000).toFixed(1)}L`;
}

function Panel({ title, icon: Icon, span, children, liveTag, to }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={to ? () => navigate(to) : undefined}
      data-testid={to ? `cxo-panel-${to.replace(/\//g, "")}` : undefined}
      className={`bg-white rounded-lg border border-[color:var(--border)] p-4 transition ${
        to ? "cursor-pointer hover:border-slate-300 hover:shadow-sm" : ""
      } ${span || ""}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">{title}</span>
        </div>
        {liveTag && <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">● LIVE</span>}
      </div>
      {children}
    </div>
  );
}

function MiniKpi({ label, value, valueClass }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 m-0">{label}</p>
      <p className={`text-sm font-semibold mt-0.5 m-0 ${valueClass || "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Sparkline({ points, color = "#1e3a8a" }) {
  if (!points || points.length < 2) return <div className="h-9" />;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const w = 200, h = 36;
  const step = w / (points.length - 1);
  const coords = points.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

function HealthDonutMini({ healthy, warning, critical, offline = 0 }) {
  const total = healthy + warning + critical + offline || 1;
  const segs = [{ v: healthy, c: "#10b981" }, { v: warning, c: "#f59e0b" }, { v: critical, c: "#ef4444" }, { v: offline, c: "#94a3b8" }];
  let acc = 0;
  const r = 28, circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 70 70" className="h-16 w-16 -rotate-90 shrink-0">
      <circle cx="35" cy="35" r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
      {segs.map((s, i) => {
        const dash = (s.v / total) * circ;
        const offset = circ - (acc / total) * circ;
        acc += s.v;
        return <circle key={i} cx="35" cy="35" r={r} fill="none" stroke={s.c} strokeWidth="8" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset} />;
      })}
    </svg>
  );
}

function BarList({ items, max, color = "#1e3a8a" }) {
  const m = max || Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="text-[11px] text-slate-600 w-20 truncate shrink-0">{it.label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(it.value / m) * 100}%`, backgroundColor: color }} />
          </div>
          <span className="text-[10px] font-mono text-slate-500 w-8 text-right shrink-0">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function CXOBoard() {
  const { modules } = useAuth();
  const [plants, setPlants] = useState([]);
  const [selectedPlantId, setSelectedPlantId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});

  useEffect(() => {
    api.get("/plants").then((r) => setPlants(r.data));
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const pid = selectedPlantId === "all" ? undefined : selectedPlantId;
      const params = pid ? { plant_id: pid } : {};

      const calls = {
        dashboard: api.get("/dashboard/summary", { params }).catch(() => null),
      };
      if (modules?.EEMS) {
        calls.energy = api.get("/energy/summary", { params }).catch(() => null);
        calls.pqi = api.get("/pqi/summary", { params }).catch(() => null);
        calls.derms = api.get("/derms/summary", { params }).catch(() => null);
        calls.ums = api.get("/ums/summary", { params }).catch(() => null);
      }
      if (modules?.OEE_APS) calls.oee = api.get("/oee/summary", { params }).catch(() => null);
      if (modules?.FIRE_SAFETY) calls.fire = api.get("/fire/summary", { params }).catch(() => null);
      if (modules?.SMART_INVENTORY) calls.inventory = api.get("/inventory/summary", { params }).catch(() => null);
      if (modules?.TQC) calls.tqc = api.get("/tqc/summary", { params }).catch(() => null);
      if (modules?.DIGITAL_WORKFORCE) calls.workforce = api.get("/workforce/summary", { params }).catch(() => null);
      if (modules?.FINANCIAL_INTELLIGENCE) calls.finance = api.get("/finance/summary", { params }).catch(() => null);

      const keys = Object.keys(calls);
      const results = await Promise.all(Object.values(calls));
      const out = {};
      keys.forEach((k, i) => { out[k] = results[i]?.data || null; });
      setData(out);
      setLoading(false);
    }
    load();
  }, [selectedPlantId, modules]);

  const d = data.dashboard;

  return (
    <div className="space-y-4" data-testid="cxo-board-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">CXO Overview</h1>
          <p className="text-sm text-slate-500">All plants, all modules — one glance.</p>
        </div>
        {plants.length > 0 && (
          <div className="flex items-center gap-1 rounded-md border border-[color:var(--border)] bg-white p-0.5">
            <button
              onClick={() => setSelectedPlantId("all")}
              data-testid="cxo-plant-tab-all"
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${selectedPlantId === "all" ? "bg-[color:var(--brand-navy)] text-white" : "text-slate-500 hover:text-slate-700"}`}
            >
              All Plants
            </button>
            {plants.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlantId(p.id)}
                data-testid={`cxo-plant-tab-${p.code}`}
                className={`px-3 py-1.5 rounded text-xs font-medium transition ${selectedPlantId === p.id ? "bg-[color:var(--brand-navy)] text-white" : "text-slate-500 hover:text-slate-700"}`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading || !d ? (
        <div className="text-sm text-slate-500 py-8 text-center">Loading overview…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ---- APM: detailed, with charts ---- */}
          {modules?.APM !== false && (
            <Panel title="Asset Performance (APM)" icon={Boxes} span="lg:col-span-2" liveTag to="/dashboard">
              <div className="grid grid-cols-4 gap-3 mb-3">
                <MiniKpi label="Total assets" value={d.kpis.total_assets} />
                <MiniKpi label="Running" value={d.kpis.running} valueClass="text-emerald-700" />
                <MiniKpi label="Fault" value={d.kpis.fault} valueClass="text-red-700" />
                <MiniKpi label="Active alarms" value={d.kpis.active_alarms} valueClass="text-amber-700" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <HealthDonutMini {...d.health_overview} />
                  <div className="text-xs">
                    <p className="text-slate-900 font-semibold text-lg m-0">{d.health_overview.average}%</p>
                    <p className="text-slate-400 m-0">avg health</p>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /><span className="text-slate-600">{d.health_overview.healthy} healthy</span></div>
                      <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="text-slate-600">{d.health_overview.critical} critical</span></div>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1">Alarms trend (7d)</p>
                  <Sparkline points={d.alarms_trend.map((a) => a.count)} color="#ef4444" />
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 mb-1.5">Assets by area</p>
                <BarList items={d.assets_by_area.slice(0, 5).map((a) => ({ label: a.area, value: a.count }))} color="#1e3a8a" />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 mb-1.5">Top faulty assets</p>
                <div className="space-y-1">
                  {d.top_faulty_assets.map((a) => (
                    <Link
                      key={a.id}
                      to={`/assets/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between text-xs hover:bg-slate-50 -mx-1 px-1 py-0.5 rounded"
                    >
                      <span className="text-slate-700">{a.asset_code}</span>
                      <span className="font-mono text-red-600">{a.health}%</span>
                    </Link>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {/* ---- Alarms & Events ---- */}
          <Panel title="Alarms & Events" icon={AlertTriangle} to="/alarms">
            <div className="text-3xl font-mono font-bold text-slate-900 mb-1">{d.kpis.active_alarms}</div>
            <p className="text-xs text-slate-400 mb-3">active · {d.kpis.critical_alarms} critical</p>
            <div className="space-y-1.5">
              {d.recent_alarms.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                  <span className="text-slate-700 truncate flex-1">{a.message}</span>
                  <span className="text-[9px] text-red-600 font-medium ml-2 shrink-0">{a.severity}</span>
                </div>
              ))}
              {d.recent_alarms.length === 0 && <div className="text-xs text-slate-400">No recent alarms</div>}
            </div>
          </Panel>

          {/* ---- EMS ---- */}
          {modules?.EEMS && data.energy && (
            <Panel title="Energy (EMS)" icon={Zap} to="/eems">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Energy" value={`${data.energy.kpis.kwh.toLocaleString()} kWh`} />
                <MiniKpi label="Cost" value={fmtInr(data.energy.kpis.cost_inr)} />
                <MiniKpi label="Peak" value={`${data.energy.kpis.peak_kw} kW`} />
                <MiniKpi label="Power factor" value={data.energy.kpis.avg_power_factor} valueClass="text-emerald-700" />
              </div>
              <div className="mt-2">
                <Sparkline points={data.energy.series.map((s) => s.kwh)} color="#2563eb" />
              </div>
            </Panel>
          )}

          {/* ---- OEE ---- */}
          {modules?.OEE_APS && data.oee && (
            <Panel title="OEE Dashboard" icon={Settings} to="/oee">
              <div className="flex items-center gap-3 mb-2">
                <div className="text-3xl font-mono font-bold text-slate-900">{data.oee.overall.oee}%</div>
                <div className="text-[10px] text-slate-400">
                  <div>Avail {data.oee.overall.availability}%</div>
                  <div>Perf {data.oee.overall.performance}%</div>
                  <div>Qual {data.oee.overall.quality}%</div>
                </div>
              </div>
              <Sparkline points={data.oee.trend.map((t) => t.oee)} color="#7c3aed" />
              {data.oee.downtime_breakdown[0] && (
                <p className="text-[11px] text-amber-700 mt-2">Top loss: {data.oee.downtime_breakdown[0].reason} ({data.oee.downtime_breakdown[0].minutes}m)</p>
              )}
            </Panel>
          )}

          {/* ---- DERMS: Solar & BESS ---- */}
          {modules?.EEMS && data.derms && (
            <Panel title="DERMS — Solar & BESS" icon={Sun} to="/derms">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Solar gen" value={`${data.derms.kpis.solar_generation_kw} kW`} valueClass="text-amber-600" />
                <MiniKpi label="BESS SoC" value={`${data.derms.kpis.bess_avg_soc_pct}%`} valueClass="text-emerald-700" />
                <MiniKpi label="EV connectors" value={data.derms.kpis.ev_connectors_active} />
                <MiniKpi label="DG synced" value={data.derms.kpis.dg_synced} />
              </div>
            </Panel>
          )}

          {/* ---- PQI ---- */}
          {modules?.EEMS && data.pqi && (
            <Panel title="Power Quality (PQI)" icon={Activity} to="/pqi">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Avg PF" value={data.pqi.kpis.avg_power_factor} />
                <MiniKpi label="THD-V" value={`${data.pqi.kpis.avg_thd_voltage_pct}%`} />
                <MiniKpi label="Active events" value={data.pqi.kpis.active_events} valueClass={data.pqi.kpis.active_events > 0 ? "text-amber-700" : "text-emerald-700"} />
                <MiniKpi label="Critical events" value={data.pqi.kpis.critical_events} valueClass={data.pqi.kpis.critical_events > 0 ? "text-red-700" : "text-emerald-700"} />
              </div>
            </Panel>
          )}

          {/* ---- UMS ---- */}
          {modules?.EEMS && data.ums && (
            <Panel title="Utilities (UMS)" icon={Droplet} to="/ums">
              <MiniKpi label="Total utility assets" value={data.ums.kpis.total_assets} />
              <div className="mt-2">
                <MiniKpi label="Active alarms" value={data.ums.kpis.active_alarms} valueClass={data.ums.kpis.active_alarms > 0 ? "text-amber-700" : "text-emerald-700"} />
              </div>
            </Panel>
          )}

          {/* ---- Fire & Safety ---- */}
          {modules?.FIRE_SAFETY && data.fire && (
            <Panel title="Fire & Safety" icon={Flame} to="/fire-safety">
              <div className="text-3xl font-mono font-bold text-slate-900 mb-1">{data.fire.readiness_score}%</div>
              <p className="text-xs text-slate-400 mb-2">readiness · status {data.fire.overall_status}</p>
              <div className="grid grid-cols-2 gap-2">
                <MiniKpi label="Critical alarms" value={data.fire.kpis.critical_alarms} valueClass={data.fire.kpis.critical_alarms > 0 ? "text-red-700" : "text-emerald-700"} />
                <MiniKpi label="Tank level" value={`${data.fire.kpis.avg_tank_pct}%`} />
              </div>
            </Panel>
          )}

          {/* ---- Smart Inventory ---- */}
          {modules?.SMART_INVENTORY && data.inventory && (
            <Panel title="Smart Inventory" icon={Package} to="/inventory">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Stock value" value={fmtInr(data.inventory.kpis.total_value_inr)} />
                <MiniKpi label="Items" value={data.inventory.kpis.total_items} />
                <MiniKpi label="Low stock" value={data.inventory.kpis.low_stock} valueClass="text-amber-700" />
                <MiniKpi label="Critical" value={data.inventory.kpis.critical} valueClass="text-red-700" />
              </div>
            </Panel>
          )}

          {/* ---- TQC ---- */}
          {modules?.TQC && data.tqc && (
            <Panel title="Quality & Carbon (TQC)" icon={ClipboardCheck} to="/tqc">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Avg defect rate" value={`${data.tqc.kpis.avg_defect_rate_pct}%`} valueClass={data.tqc.kpis.avg_defect_rate_pct > 4 ? "text-red-700" : "text-emerald-700"} />
                <MiniKpi label="Batches" value={data.tqc.kpis.batches} />
                <MiniKpi label="Carbon (30d)" value={`${(data.tqc.kpis.total_carbon_kg_30d / 1000).toFixed(1)} T`} valueClass="text-emerald-700" />
                <MiniKpi label="Failed" value={data.tqc.kpis.failed_batches} valueClass="text-red-700" />
              </div>
            </Panel>
          )}

          {/* ---- Digital Workforce ---- */}
          {modules?.DIGITAL_WORKFORCE && data.workforce && (
            <Panel title="Digital Workforce" icon={UserCheck} to="/workforce">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Attendance" value={`${data.workforce.kpis.attendance_pct}%`} valueClass="text-emerald-700" />
                <MiniKpi label="Present / Planned" value={`${data.workforce.kpis.headcount_present}/${data.workforce.kpis.headcount_planned}`} />
                <MiniKpi label="Avg productivity" value={`${data.workforce.kpis.avg_productivity}%`} />
              </div>
            </Panel>
          )}

          {/* ---- Financial Intelligence ---- */}
          {modules?.FINANCIAL_INTELLIGENCE && data.finance && (
            <Panel title="Financial Intelligence" icon={IndianRupee} to="/finance">
              <div className="grid grid-cols-2 gap-3">
                <MiniKpi label="Revenue" value={fmtInr(data.finance.kpis.total_revenue_inr)} />
                <MiniKpi label="Cost" value={fmtInr(data.finance.kpis.total_cost_inr)} valueClass="text-red-700" />
                <MiniKpi label="Avg margin" value={`${data.finance.kpis.avg_margin_pct}%`} valueClass="text-emerald-700" />
              </div>
            </Panel>
          )}

        </div>
      )}
    </div>
  );
}
