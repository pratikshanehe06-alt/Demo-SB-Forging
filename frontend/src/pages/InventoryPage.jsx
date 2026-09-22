import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Package, AlertTriangle, IndianRupee, ArrowLeftRight } from "lucide-react";

const STATUS_STYLES = {
  OK: "text-emerald-700 bg-emerald-50 border-emerald-200",
  LOW: "text-amber-700 bg-amber-50 border-amber-200",
  CRITICAL: "text-red-700 bg-red-50 border-red-200",
  OVERSTOCK: "text-blue-700 bg-blue-50 border-blue-200",
};

function KpiCard({ icon: Icon, label, value, color = "text-[color:var(--brand-navy)]" }) {
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

export default function InventoryPage() {
  const [data, setData] = useState(null);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    api.get("/inventory/summary").then((r) => setData(r.data));
  }, []);

  if (!data) {
    return (
      <div className="space-y-4" data-testid="inventory-page">
        <h1 className="text-2xl font-display font-bold text-slate-900">Smart Inventory & Material Handling</h1>
        <div className="text-sm text-slate-500">Loading…</div>
      </div>
    );
  }

  const { kpis, items, recent_movements } = data;
  const categories = ["all", ...new Set(items.map((i) => i.category))];
  const visible = category === "all" ? items : items.filter((i) => i.category === category);

  return (
    <div className="space-y-4" data-testid="inventory-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-900">Smart Inventory & Material Handling</h1>
        <p className="text-sm text-slate-500">Spares, consumables, raw material and tools across plants.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Package} label="Total Items" value={kpis.total_items} />
        <KpiCard icon={AlertTriangle} label="Low Stock" value={kpis.low_stock} color="text-amber-600" />
        <KpiCard icon={AlertTriangle} label="Critical" value={kpis.critical} color="text-red-600" />
        <KpiCard icon={IndianRupee} label="Stock Value" value={`₹${(kpis.total_value_inr / 100000).toFixed(1)}L`} />
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                category === c ? "bg-[color:var(--brand-navy)] text-white border-[color:var(--brand-navy)]" : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {c === "all" ? "All" : c.replace("_", " ")}
            </button>
          ))}
        </div>
        <table className="w-full text-sm" data-testid="inventory-items-table">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b">
              <th className="py-2 px-2 font-semibold">SKU</th>
              <th className="py-2 px-2 font-semibold">Item</th>
              <th className="py-2 px-2 font-semibold">Qty on Hand</th>
              <th className="py-2 px-2 font-semibold">Reorder Pt</th>
              <th className="py-2 px-2 font-semibold">Location</th>
              <th className="py-2 px-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-2 px-2 font-mono text-xs text-slate-600">{i.sku}</td>
                <td className="py-2 px-2 font-medium text-slate-800">{i.name}</td>
                <td className="py-2 px-2 font-mono">{i.qty_on_hand} {i.uom}</td>
                <td className="py-2 px-2 font-mono text-slate-500">{i.reorder_point} {i.uom}</td>
                <td className="py-2 px-2 text-slate-600">{i.location}</td>
                <td className="py-2 px-2">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${STATUS_STYLES[i.status] || STATUS_STYLES.OK}`}>{i.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg border border-[color:var(--border)] p-5">
        <div className="flex items-center gap-2 mb-3">
          <ArrowLeftRight className="h-4 w-4 text-[color:var(--brand-navy)]" />
          <span className="font-semibold text-sm text-slate-800">Recent Movements</span>
        </div>
        <div className="space-y-1.5">
          {recent_movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b border-slate-50 last:border-0">
              <span className="text-slate-700">{m.sku} · {m.type}</span>
              <span className="text-xs text-slate-500">{m.qty} · {m.reference} · {new Date(m.ts).toLocaleDateString()}</span>
            </div>
          ))}
          {recent_movements.length === 0 && <div className="text-xs text-slate-400">No recent movements.</div>}
        </div>
      </div>
    </div>
  );
}
