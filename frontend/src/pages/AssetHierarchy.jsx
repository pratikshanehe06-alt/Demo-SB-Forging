import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ChevronDown, ChevronRight, Factory, Layers, Cpu, AlertTriangle, Clock, TimerOff } from "lucide-react";
import { StatusPill } from "@/components/Pills";

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

function healthColor(health) {
  if (health >= 80) return "bg-emerald-500";
  if (health >= 55) return "bg-amber-500";
  return "bg-red-500";
}

const CRITICALITY_STYLES = {
  HIGH: "text-red-700 bg-red-50 border-red-200",
  MEDIUM: "text-amber-700 bg-amber-50 border-amber-200",
  LOW: "text-slate-600 bg-slate-50 border-slate-200",
};

function AssetCard({ asset, alarmCounts, downtimeByAsset }) {
  const counts = alarmCounts[asset.id] || { critical: 0, major: 0, minor: 0 };
  const totalActive = counts.critical + counts.major + counts.minor;
  const downtime = downtimeByAsset[asset.id];
  const downtimeMin = downtime?.downtime_min || 0;

  return (
    <Link
      to={`/assets/${asset.id}`}
      data-testid={`asset-card-${asset.asset_code}`}
      className="group flex flex-col gap-3 rounded-lg border border-[color:var(--border)] bg-white p-4 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-50 border border-slate-100">
            <Cpu className="h-4 w-4 text-[color:var(--brand-navy)]" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">{asset.asset_code}</div>
            <div className="text-xs text-slate-500 truncate">{asset.asset_type}</div>
          </div>
        </div>
        <StatusPill status={asset.status} />
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Health</span>
          <span className="font-medium text-slate-700">{asset.health}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${healthColor(asset.health)}`}
            style={{ width: `${Math.max(2, asset.health)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <AlertTriangle
            className={`h-3.5 w-3.5 shrink-0 ${totalActive > 0 ? "text-red-500" : "text-slate-300"}`}
          />
          {totalActive > 0 ? (
            <span className="font-medium text-slate-700 truncate">
              {counts.critical > 0 && <span className="text-red-600">{counts.critical} crit</span>}
              {counts.critical > 0 && counts.major > 0 && ", "}
              {counts.major > 0 && <span className="text-amber-600">{counts.major} maj</span>}
            </span>
          ) : (
            <span className="text-slate-400">No alarms</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 justify-end">
          <TimerOff className={`h-3.5 w-3.5 shrink-0 ${downtimeMin > 0 ? "text-orange-500" : "text-slate-300"}`} />
          <span className={`font-medium ${downtimeMin > 0 ? "text-orange-700" : "text-slate-400"}`}>
            {formatDowntime(downtimeMin)} down
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          <span>Seen {timeAgo(asset.last_seen)}</span>
        </div>
        {asset.criticality && (
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${CRITICALITY_STYLES[asset.criticality] || CRITICALITY_STYLES.LOW}`}>
            {asset.criticality}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function AssetHierarchyPage() {
  const [tree, setTree] = useState([]);
  const [assetsById, setAssetsById] = useState({});
  const [alarmCounts, setAlarmCounts] = useState({});
  const [downtimeByAsset, setDowntimeByAsset] = useState({});
  const [expanded, setExpanded] = useState({});

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

    // Downtime totals (last 24h) per asset, bulk in one call
    api.get("/assets/downtime-summary", { params: { days: 1 } }).then((r) => {
      const map = {};
      r.data.forEach((d) => { map[d.asset_id] = d; });
      setDowntimeByAsset(map);
    });
  }, []);

  function toggle(id) { setExpanded((e) => ({ ...e, [id]: !e[id] })); }

  function resolveAsset(stub) {
    return assetsById[stub.id] || stub;
  }

  return (
    <div className="space-y-4" data-testid="asset-hierarchy-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Asset Hierarchy</h1>
        <p className="text-sm text-slate-500">Plant → Area → Asset structure</p>
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
                      <div className="ml-6 pl-3 pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {area.assets.map((stub) => (
                          <AssetCard
                            key={stub.id}
                            asset={resolveAsset(stub)}
                            alarmCounts={alarmCounts}
                            downtimeByAsset={downtimeByAsset}
                          />
                        ))}
                      </div>
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
