import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { ChevronDown, ChevronRight, Factory, Layers, Cpu } from "lucide-react";
import { StatusPill } from "@/components/Pills";

export default function AssetHierarchyPage() {
  const [tree, setTree] = useState([]);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    api.get("/assets/hierarchy").then((r) => {
      setTree(r.data);
      // expand first plant + all its areas by default
      const init = {};
      r.data.forEach((p) => {
        init[p.id] = true;
        p.areas.forEach((a) => (init[a.id] = true));
      });
      setExpanded(init);
    });
  }, []);

  function toggle(id) { setExpanded((e) => ({ ...e, [id]: !e[id] })); }

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
                  <div key={area.id} className="mb-1">
                    <button onClick={() => toggle(area.id)} className="w-full flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-50">
                      {expanded[area.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <Layers className="h-4 w-4 text-amber-600" />
                      <span className="font-medium text-slate-700">{area.name}</span>
                      <span className="ml-2 text-xs text-slate-500">({area.assets.length})</span>
                    </button>
                    {expanded[area.id] && (
                      <div className="ml-6 border-l border-slate-200 pl-3">
                        {area.assets.map((a) => (
                          <Link to={`/assets/${a.id}`} key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50">
                            <div className="flex items-center gap-2">
                              <Cpu className="h-3.5 w-3.5 text-slate-500" />
                              <span className="text-sm font-medium text-slate-800">{a.asset_code}</span>
                              <span className="text-xs text-slate-500">{a.asset_type}</span>
                            </div>
                            <StatusPill status={a.status} />
                          </Link>
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
