import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell
} from "recharts";
import { AlertOctagon } from "lucide-react";

const REASON_COLORS = {
  "Breakdown": "#ef4444",
  "Tool change": "#f59e0b",
  "Material shortage": "#0891b2",
  "Setup": "#1e3a8a",
  "No operator": "#a855f7",
  "Power dip": "#64748b",
};

export default function DowntimeReasonChart({ assetId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/assets/${assetId}/downtime-breakdown`, { params: { days: 30 } })
      .then((r) => setData(r.data)).catch(() => setData({ breakdown: [], total_minutes: 0, event_count: 0 }));
  }, [assetId]);

  if (!data) return null;

  return (
    <div className="bg-white rounded-lg border border-[color:var(--border)] p-5" data-testid="downtime-reasons">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display font-semibold text-slate-800 flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-red-600" /> Downtime root-cause (30 days)
        </h3>
        <div className="text-xs text-slate-500">
          {data.event_count} events · <span className="font-mono font-bold text-slate-800">{data.total_minutes}</span> min total
        </div>
      </div>
      {data.breakdown.length === 0 ? (
        <div className="text-center py-8 text-emerald-600">
          <div className="font-semibold">No downtime in the last 30 days 🎉</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.breakdown} layout="vertical" margin={{ left: 40 }}>
            <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} unit=" min" />
            <YAxis dataKey="reason" type="category" width={130} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
            <Bar dataKey="minutes" radius={[0, 6, 6, 0]}>
              {data.breakdown.map((d, i) => (
                <Cell key={i} fill={REASON_COLORS[d.reason] || "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
