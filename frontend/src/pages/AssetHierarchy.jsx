import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ChevronDown, ChevronRight, Factory, Layers, Cpu, LayoutGrid, List as ListIcon } from "lucide-react";

function timeAgo(iso) {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDowntime(mins) {
  if (!mins || mins <= 0) return "0m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Status → dot color, label color (text), used for the dot+label header
const STATUS_STYLES = {
  RUNNING: { dot: "#3b6d11", text: "text-emerald-800" },
  IDLE: { dot: "#ef9f27", text: "text-amber-800" },
  WARNING: { dot: "#ef9f27", text: "text-amber-800" },
  FAULT: { dot: "#e24b4a", text: "text-red-800" },
  CRITICAL: { dot: "#e24b4a", text: "text-red-800" },
  STOPPED: { dot: "#94a3b8", text: "text-slate-600" },
  OFFLINE: { dot: "#94a3b8", text: "text-slate-600" },
};

// Status → color for numeric stat values that should echo severity (Health, Alarms)
const SEVERITY_TEXT = {
  RUNNING: "text-emerald-700",
  IDLE: "text-amber-700",
  WARNING: "text-amber-700",
  FAULT: "text-red-700",
  CRITICAL: "text-red-700",
  STOPPED: "text-slate-600",
  OFFLINE: "text-slate-600",
};

const CRITICALITY_STYLES = {
  HIGH: "text-red-700 bg-red-50 border-red-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
};

function Stat({ label, value, colorClass }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 m-0">{label}</p>
      <p className={`text-[11px] font-medium mt-0.5 m-0 ${colorClass || "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function AssetCard({ asset, alarmCounts, overviewMetrics }) {
  const counts = alarmCounts[asset.id] || { critical: 0, major: 0, minor: 0 };
  const totalActive = counts.critical + counts.major + counts.minor;
  const metrics = overviewMetrics[asset.id] || {};
  const statusStyle = STATUS_STYLES[asset.status] || STATUS_STYLES.OFFLINE;
  const severityColor = SEVERITY_TEXT[asset.status] || "text-slate-700";

  const alarmsText = totalActive === 0
    ? "None"
    : [
        counts.critical > 0 ? `${counts.critical} crit` : null,
        counts.major > 0 ? `${counts.major} maj` : null,
        counts.minor > 0 ? `${counts.minor} min` : null,
      ].filter(Boolean).join(" · ");

  const etaText = metrics.maintenance_eta_days === null || metrics.maintenance_eta_days === undefined
    ? "Not scheduled"
    : metrics.maintenance_eta_days === 0
    ? "Due today"
    : `ETA ${metrics.maintenance_eta_days}d`;

  return (
    <Link
      to={`/assets/${asset.id}`}
      data-testid={`asset-card-${asset.asset_code}`}
      className="group flex flex-col rounded-r-lg border border-l-4 bg-white p-3.5 transition hover:border-slate-300 hover:shadow-sm"
      style={{ borderLeftColor: statusStyle.dot }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: statusStyle.dot }} />
        <span className={`text-[11px] font-semibold tracking-wide uppercase ${statusStyle.text}`}>{asset.status}</span>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-50 border border-slate-100">
          <Cpu className="h-3.5 w-3.5 text-[color:var(--brand-navy)]" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{asset.asset_code}</div>
          <div className="text-[11px] text-slate-500 truncate">{asset.asset_type}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2.5 border-t border-slate-100">
        <Stat label="Health" value={`${asset.health}%`} colorClass={severityColor} />
        <Stat label="Alarms & events" value={alarmsText} colorClass={totalActive > 0 ? "text-red-700" : "text-slate-500"} />
        <Stat label="Predicted maint." value={etaText} colorClass={metrics.maintenance_eta_days !== null && metrics.maintenance_eta_days !== undefined && metrics.maintenance_eta_days <= 7 ? "text-amber-700" : "text-slate-700"} />
        <Stat label="Running hrs" value={metrics.runtime_hours !== undefined ? `${metrics.runtime_hours}h` : "—"} />
        <Stat label="Downtime" value={formatDowntime(metrics.downtime_min_total)} />
        <Stat label="Production" value={metrics.production_total !== undefined ? `${metrics.production_total.toLocaleString()} jobs` : "—"} />
      </div>

      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 mt-2 border-t border-slate-50">
        <span>Seen {timeAgo(asset.last_seen)}</span>
        {asset.criticality && (
          <span className={`px-1.5 py-0.5 rounded border font-medium ${CRITICALITY_STYLES[asset.criticality] || CRITICALITY_STYLES.LOW}`}>
            {asset.criticality}
          </span>
        )}
      </div>
    </Link>
  );
}

function AssetListRow({ asset, alarmCounts, overviewMetrics }) {
  const counts = alarmCounts[asset.id] || { critical: 0, major: 0, minor: 0 };
  const totalActive = counts.critical + counts.major + counts.minor;
  const metrics = overviewMetrics[asset.id] || {};
  const statusStyle = STATUS_STYLES[asset.status] || STATUS_STYLES.OFFLINE;
  const severityColor = SEVERITY_TEXT[asset.status] || "text-slate-700";

  const alarmsText = totalActive === 0
    ? "None"
    : [
        counts.critical > 0 ? `${counts.critical} crit` : null,
        counts.major > 0 ? `${counts.major} maj` : null,
        counts.minor > 0 ? `${counts.minor} min` : null,
      ].filter(Boolean).join(" · ");

  const etaText = metrics.maintenance_eta_days === null || metrics.maintenance_eta_days === undefined
    ? "Not scheduled"
    : metrics.maintenance_eta_days === 0
    ? "Due today"
    : `ETA ${metrics.maintenance_eta_days}d`;

  return (
    <Link
      to={`/assets/${asset.id}`}
      data-testid={`asset-row-${asset.asset_code}`}
      className="grid grid-cols-9 items-center gap-2 px-3 py-2.5 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-sm"
    >
      <div className="flex items-center gap-1.5 col-span-2 min-w-0">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: statusStyle.dot }} />
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{asset.asset_code}</div>
          <div className="text-[11px] text-slate-500 truncate">{asset.asset_type}</div>
        </div>
      </div>
      <span className={`text-[11px] font-semibold tracking-wide uppercase ${statusStyle.text}`}>{asset.status}</span>
      <span className={`text-xs font-medium ${severityColor}`}>{asset.health}%</span>
      <span className={`text-xs font-medium ${totalActive > 0 ? "text-red-700" : "text-slate-500"}`}>{alarmsText}</span>
      <span className={`text-xs font-medium ${metrics.maintenance_eta_days !== null && metrics.maintenance_eta_days !== undefined && metrics.maintenance_eta_days <= 7 ? "text-amber-700" : "text-slate-700"}`}>{etaText}</span>
      <span className="text-xs text-slate-700">{metrics.runtime_hours !== undefined ? `${metrics.runtime_hours}h` : "—"}</span>
      <span className="text-xs text-slate-700">{formatDowntime(metrics.downtime_min_total)}</span>
      <span className="text-xs text-slate-700">{metrics.production_total !== undefined ? `${metrics.production_total.toLocaleString()} jobs` : "—"}</span>
    </Link>
  );
}

export default function AssetHierarchyPage() {
  const [tree, setTree] = useState([]);
  const [assetsById, setAssetsById] = useState({});
  const [alarmCounts, setAlarmCounts] = useState({});
  const [overviewMetrics, setOverviewMetrics] = useState({});
  const [expanded, setExpanded] = useState({});
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "card";
    return window.localStorage.getItem("asset_hierarchy_view") || "card";
  });

  useEffect(() => {
    window.localStorage.setItem("asset_hierarchy_view", viewMode);
  }, [viewMode]);

  useEffect(() => {
    api.get("/assets/hierarchy").then((r) => {
      setTree(r.data);
      const init = {};
      r.data.forEach((p) => {
        init[p.id] = true;
        p.areas.forEach((a) => (init[a.id] = true));
      });
      setExpanded(init);
    });

    // Full asset details (health, criticality, last_seen) keyed by id
    api.get("/assets").then((r) => {
      const map = {};
      r.data.forEach((a) => { map[a.id] = a; });
      setAssetsById(map);
    });

    // Active alarm counts per asset
    api.get("/alarms", { params: { acknowledged: false } }).then((r) => {
      const counts = {};
      r.data.forEach((alarm) => {
        const c = counts[alarm.asset_id] || { critical: 0, major: 0, minor: 0 };
        if (alarm.severity === "CRITICAL") c.critical += 1;
        else if (alarm.severity === "MAJOR") c.major += 1;
        else c.minor += 1;
        counts[alarm.asset_id] = c;
      });
      setAlarmCounts(counts);
    });

    // Running hours, downtime, production totals, maintenance ETA — bulk in one call
    api.get("/assets/overview-metrics").then((r) => {
      setOverviewMetrics(r.data);
    });
  }, []);

  function toggle(id) { setExpanded((e) => ({ ...e, [id]: !e[id] })); }

  function resolveAsset(stub) {
    return assetsById[stub.id] || stub;
  }

  return (
    <div className="space-y-4" data-testid="asset-hierarchy-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Asset Dashboard</h1>
          <p className="text-sm text-slate-500">Plant → Area → Asset structure</p>
        </div>
        <div className="flex items-center rounded-md border border-[color:var(--border)] bg-white p-0.5">
          <button
            onClick={() => setViewMode("card")}
            data-testid="asset-view-card"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              viewMode === "card" ? "bg-[color:var(--brand-navy)] text-white" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Cards
          </button>
          <button
            onClick={() => setViewMode("list")}
            data-testid="asset-view-list"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition ${
              viewMode === "list" ? "bg-[color:var(--brand-navy)] text-white" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <ListIcon className="h-3.5 w-3.5" /> List
          </button>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
        <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-2 px-2">SB Forgtech Pvt Ltd</div>
        {tree.map((plant) => (
          <div key={plant.id} className="mb-2">
            <button onClick={() => toggle(plant.id)} className="w-full flex items-center gap-2 py-2 px-2 rounded hover:bg-slate-50" data-testid={`plant-${plant.name}`}>
              {expanded[plant.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Factory className="h-4 w-4 text-[color:var(--brand-navy)]" />
              <span className="font-semibold text-slate-800">{plant.name}</span>
              <span className="ml-2 text-xs text-slate-500">({plant.areas.length} areas)</span>
            </button>
            {expanded[plant.id] && (
              <div className="ml-6 border-l border-slate-200 pl-3">
                {plant.areas.map((area) => (
                  <div key={area.id} className="mb-3">
                    <button onClick={() => toggle(area.id)} className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50">
                      {expanded[area.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Layers className="h-4 w-4 text-amber-600" />
                      <span className="font-medium text-slate-700">{area.name}</span>
                      <span className="ml-2 text-xs text-slate-500">({area.assets.length})</span>
                    </button>
                    {expanded[area.id] && (
                      viewMode === "card" ? (
                        <div className="ml-6 pl-3 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {area.assets.map((stub) => (
                            <AssetCard
                              key={stub.id}
                              asset={resolveAsset(stub)}
                              alarmCounts={alarmCounts}
                              overviewMetrics={overviewMetrics}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="ml-6 pl-3 pt-2 mr-2">
                          <div className="rounded-lg border border-[color:var(--border)] bg-white overflow-hidden">
                            <div className="grid grid-cols-9 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                              <span className="col-span-2">Asset</span>
                              <span>Status</span>
                              <span>Health</span>
                              <span>Alarms & events</span>
                              <span>Predicted maint.</span>
                              <span>Running hrs</span>
                              <span>Downtime</span>
                              <span>Production</span>
                            </div>
                            {area.assets.map((stub) => (
                              <AssetListRow
                                key={stub.id}
                                asset={resolveAsset(stub)}
                                alarmCounts={alarmCounts}
                                overviewMetrics={overviewMetrics}
                              />
                            ))}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
