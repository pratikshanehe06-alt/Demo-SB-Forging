import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { usePlant } from "@/lib/plantContext";
import { Plus, MoreHorizontal, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { StatusPill, HealthPill } from "@/components/Pills";
import AddAssetDialog from "@/components/AddAssetDialog";
import { toast } from "sonner";

const PAGE_SIZE = 10;

export default function AssetListPage() {
  const [assets, setAssets] = useState([]);
  const [areas, setAreas] = useState([]);
  const [filters, setFilters] = useState({ area_id: "all", asset_type: "all", status: "all" });
  const [page, setPage] = useState(1);
  const [openAdd, setOpenAdd] = useState(false);
  const { params: plantParams, selectedPlantId } = usePlant();
  const navigate = useNavigate();

  async function load() {
    const params = { ...plantParams };
    if (filters.area_id !== "all") params.area_id = filters.area_id;
    if (filters.asset_type !== "all") params.asset_type = filters.asset_type;
    if (filters.status !== "all") params.status = filters.status;
    const { data } = await api.get("/assets", { params });
    setAssets(data);
    setPage(1);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, selectedPlantId]);
  useEffect(() => { api.get("/areas").then((r) => setAreas(r.data)); }, []);

  const assetTypes = useMemo(() => Array.from(new Set(assets.map((a) => a.asset_type))), [assets]);
  const totalPages = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const pageAssets = assets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-4" data-testid="asset-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Asset List</h1>
          <p className="text-sm text-slate-500">{assets.length} assets across all areas</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <FilterSelect label="Area" testid="filter-area" value={filters.area_id} onChange={(v) => setFilters((f) => ({ ...f, area_id: v }))} options={[{ value: "all", label: "All" }, ...areas.map((a) => ({ value: a.id, label: a.name }))]} />
          <FilterSelect label="Asset Type" testid="filter-type" value={filters.asset_type} onChange={(v) => setFilters((f) => ({ ...f, asset_type: v }))} options={[{ value: "all", label: "All" }, ...assetTypes.map((t) => ({ value: t, label: t }))]} />
          <FilterSelect label="Status" testid="filter-status" value={filters.status} onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={["all", "RUNNING", "IDLE", "FAULT", "OFFLINE", "WARNING", "CRITICAL", "STOPPED"].map((s) => ({ value: s, label: s === "all" ? "All" : s }))} />
          <div className="flex-1" />
          <Button variant="outline" onClick={() => navigate("/assets/compare")} data-testid="compare-link-btn">
            <GitCompareArrows className="h-4 w-4 mr-1" /> Compare
          </Button>
          <Button onClick={() => setOpenAdd(true)} data-testid="add-asset-btn" className="bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)]">
            <Plus className="h-4 w-4 mr-1" /> Add Asset
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm" data-testid="assets-table">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
                <th className="py-3 px-2 font-semibold">Asset Name</th>
                <th className="py-3 px-2 font-semibold">Asset Type</th>
                <th className="py-3 px-2 font-semibold">Area</th>
                <th className="py-3 px-2 font-semibold">Status</th>
                <th className="py-3 px-2 font-semibold">Health</th>
                <th className="py-3 px-2 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageAssets.map((a) => (
                <tr key={a.id} className="data-row border-b last:border-0" data-testid={`asset-row-${a.asset_code}`}>
                  <td className="py-3 px-2">
                    <Link to={`/assets/${a.id}`} className="font-medium text-slate-900 hover:text-[color:var(--brand-blue)]">
                      {a.asset_code}
                    </Link>
                    <div className="text-xs text-slate-500">{a.name}</div>
                  </td>
                  <td className="py-3 px-2 text-slate-700">{a.asset_type}</td>
                  <td className="py-3 px-2 text-slate-700">{a.area_name}</td>
                  <td className="py-3 px-2"><StatusPill status={a.status} /></td>
                  <td className="py-3 px-2"><HealthPill value={a.health} /></td>
                  <td className="py-3 px-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-slate-100" data-testid={`asset-action-${a.asset_code}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white">
                        <DropdownMenuItem asChild><Link to={`/assets/${a.id}`}>View 360</Link></DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.info("Edit coming soon")}>Edit</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-red-600" onClick={() => toast.info("Deactivate flow coming soon")}>Deactivate</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {pageAssets.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-slate-500">No assets match filters</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-1 pt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              data-testid={`page-${n}`}
              className={`h-8 min-w-8 px-2 rounded-md text-sm ${page === n ? "bg-[color:var(--brand-navy)] text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {n}
            </button>
          ))}
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="h-8 px-3 rounded-md text-sm text-slate-600 hover:bg-slate-100">Next</button>
        </div>
      </div>

      <AddAssetDialog open={openAdd} onOpenChange={setOpenAdd} onCreated={load} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, testid }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testid} className="h-9 w-40 bg-white"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-white">
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
