import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { X, Plus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

const STATUS_STYLES = {
  NORMAL: "text-emerald-700 bg-emerald-50 border-emerald-200",
  ATTENTION: "text-amber-700 bg-amber-50 border-amber-200",
  ALARM: "text-red-700 bg-red-50 border-red-200",
  FAULT: "text-red-700 bg-red-50 border-red-200",
  OFFLINE: "text-slate-600 bg-slate-50 border-slate-200",
};

function StatusPill({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.OFFLINE}`}>
      {status}
    </span>
  );
}

function metricKeyFor(assetType) {
  if (assetType === "FIRE_WATER_TANK") return "level_pct";
  return "pressure_bar";
}

export default function FireAssetCompare() {
  const [allAssets, setAllAssets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [compareData, setCompareData] = useState([]);

  useEffect(() => {
    api.get("/fire/assets").then((r) => setAllAssets(r.data));
  }, []);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setCompareData([]);
      return;
    }
    api.get("/fire/assets/compare", { params: { ids: selectedIds.join(",") } }).then((r) => setCompareData(r.data));
  }, [selectedIds]);

  function addAsset(id) {
    if (id && !selectedIds.includes(id) && selectedIds.length < 4) {
      setSelectedIds([...selectedIds, id]);
    }
  }
  function removeAsset(id) {
    setSelectedIds(selectedIds.filter((x) => x !== id));
  }

  const available = allAssets.filter((a) => !selectedIds.includes(a.id));

  return (
    <div className="space-y-4" data-testid="fire-asset-compare-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Fire Asset Comparison</h1>
        <p className="text-sm text-slate-500">Compare up to 4 fire & safety devices side by side.</p>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4 flex items-center gap-2 flex-wrap">
        {selectedIds.map((id) => {
          const a = allAssets.find((x) => x.id === id);
          if (!a) return null;
          return (
            <span key={id} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-slate-100 text-sm">
              {a.asset_code}
              <button onClick={() => removeAsset(id)} className="hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
            </span>
          );
        })}
        {selectedIds.length < 4 && (
          <Select onValueChange={addAsset} value="">
            <SelectTrigger className="w-52 h-9" data-testid="fire-compare-add">
              <div className="flex items-center gap-1.5 text-sm text-slate-500">
                <Plus className="h-3.5 w-3.5" /> <SelectValue placeholder="Add asset to compare" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.asset_code} — {a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {compareData.length === 0 ? (
        <div className="text-sm text-slate-400 py-8 text-center">Add assets above to compare them.</div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 ${compareData.length >= 3 ? "xl:grid-cols-4" : ""} gap-4`}>
          {compareData.map((a) => {
            const mk = metricKeyFor(a.asset_type);
            const chartData = a.history.map((r) => ({
              time: new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              value: r[mk],
            }));
            return (
              <div key={a.id} className="bg-white rounded-lg border border-[color:var(--border)] p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-800">{a.asset_code}</div>
                    <div className="text-xs text-slate-500">{a.asset_type.replace("_", " ")}</div>
                  </div>
                  <StatusPill status={a.status} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center my-3">
                  <div className="bg-slate-50 rounded-md py-1.5">
                    <div className="text-[9px] uppercase text-slate-400">Health</div>
                    <div className="text-sm font-mono font-semibold">{a.health}%</div>
                  </div>
                  <div className="bg-slate-50 rounded-md py-1.5">
                    <div className="text-[9px] uppercase text-slate-400">Maintenance</div>
                    <div className="text-sm font-mono font-semibold">{a.maintenance_count}</div>
                  </div>
                </div>
                {chartData.length > 1 && (
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 9 }} />
                        <Tooltip contentStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="value" stroke="#1e3a8a" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
