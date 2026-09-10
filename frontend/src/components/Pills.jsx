import { cn } from "@/lib/utils";

const MAP = {
  RUNNING: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300", dot: "bg-emerald-500" },
  STOPPED: { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-300", dot: "bg-slate-500" },
  IDLE: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-300", dot: "bg-amber-500" },
  WARNING: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300", dot: "bg-orange-500" },
  FAULT: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300", dot: "bg-red-500" },
  CRITICAL: { bg: "bg-red-900", text: "text-white", border: "border-red-700", dot: "bg-red-300" },
  OFFLINE: { bg: "bg-slate-100", text: "text-slate-500", border: "border-slate-300", dot: "bg-slate-400" },
};

export function StatusPill({ status, className, testid }) {
  const s = MAP[status] || MAP.OFFLINE;
  const pulsing = status === "WARNING" || status === "CRITICAL" || status === "FAULT";
  return (
    <span
      data-testid={testid || `status-${status?.toLowerCase()}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        s.bg, s.text, s.border, className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, pulsing && "pulse-dot")} style={pulsing ? { color: "currentColor" } : {}} />
      {status}
    </span>
  );
}

export function HealthPill({ value, testid }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  let cls = "bg-emerald-50 text-emerald-700 border-emerald-300";
  let dot = "bg-emerald-500";
  if (v < 60) { cls = "bg-red-50 text-red-700 border-red-300"; dot = "bg-red-500"; }
  else if (v < 80) { cls = "bg-amber-50 text-amber-700 border-amber-300"; dot = "bg-amber-500"; }
  return (
    <span data-testid={testid || "health-pill"} className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular", cls)}>
      {v}%
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
    </span>
  );
}

export function SeverityBadge({ severity }) {
  const map = {
    CRITICAL: "bg-red-100 text-red-700 border-red-300",
    MAJOR: "bg-orange-100 text-orange-700 border-orange-300",
    MINOR: "bg-yellow-100 text-yellow-800 border-yellow-300",
    INFO: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={cn("inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider", map[severity] || map.INFO)}>
      {severity}
    </span>
  );
}
