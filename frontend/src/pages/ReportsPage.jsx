import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileBarChart2, Download, FileText, FileJson, FileSpreadsheet, Sparkles, Save, Trash2, Play,
  TrendingUp, Factory, Activity, Wrench, Zap, Timer,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Line, Area, Bar, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, BarChart,
} from "recharts";
import { api, API_BASE } from "@/lib/api";
import { usePlant } from "@/lib/plantContext";
import { useAuth } from "@/lib/auth";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const ICON_FOR = {
  PRODUCTION: Factory,
  OEE: Activity,
  ENERGY: Zap,
  DOWNTIME: Timer,
  MAINTENANCE: Wrench,
};

const AGG_LABEL = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };

function todayIso() { return new Date().toISOString().slice(0, 10); }
function daysAgoIso(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const { plants, selectedPlantId } = usePlant();
  const { token } = useAuth();
  const [catalog, setCatalog] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [reportType, setReportType] = useState("PRODUCTION");
  const [metric, setMetric] = useState("");
  const [aggregation, setAggregation] = useState("daily");
  const [startDate, setStartDate] = useState(daysAgoIso(29));
  const [endDate, setEndDate] = useState(todayIso());
  const [plantId, setPlantId] = useState("all");
  const [includeForecast, setIncludeForecast] = useState(true);
  const [forecastPeriods, setForecastPeriods] = useState(7);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    api.get("/reports/catalog").then((r) => setCatalog(r.data)).catch(() => {});
    loadTemplates();
    // eslint-disable-next-line
  }, []);

  const loadTemplates = () =>
    api.get("/reports/templates").then((r) => setTemplates(r.data)).catch(() => setTemplates([]));

  const meta = useMemo(
    () => catalog?.reports?.find((r) => r.key === reportType),
    [catalog, reportType],
  );

  useEffect(() => {
    if (meta && !meta.metrics.includes(metric)) setMetric(meta.default_metric);
    // eslint-disable-next-line
  }, [meta]);

  useEffect(() => {
    setPlantId(selectedPlantId || "all");
  }, [selectedPlantId]);

  const buildRequest = useCallback(() => ({
    report_type: reportType,
    start_date: startDate,
    end_date: endDate,
    plant_id: plantId === "all" ? null : plantId,
    metric: metric || meta?.default_metric || null,
    aggregation,
    include_forecast: includeForecast,
    forecast_periods: Number(forecastPeriods) || 7,
  }), [reportType, startDate, endDate, plantId, metric, meta, aggregation, includeForecast, forecastPeriods]);

  const runReport = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/reports/run", buildRequest());
      setResult(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to run report");
    } finally {
      setLoading(false);
    }
  };

  const doExport = async (format) => {
    try {
      const res = await fetch(`${API_BASE}/reports/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...buildRequest(), format }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const ext = format;
      const name = `${reportType.toLowerCase()}_${startDate}_${endDate}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) {
      toast.error("Export failed");
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      await api.post("/reports/templates", { name: templateName.trim(), request: buildRequest() });
      toast.success("Template saved");
      setSaveOpen(false); setTemplateName("");
      loadTemplates();
    } catch { toast.error("Could not save template"); }
  };

  const applyTemplate = (t) => {
    const r = t.request || {};
    setReportType(r.report_type || "PRODUCTION");
    setAggregation(r.aggregation || "daily");
    setStartDate(r.start_date || daysAgoIso(29));
    setEndDate(r.end_date || todayIso());
    setPlantId(r.plant_id || "all");
    setMetric(r.metric || "");
    setIncludeForecast(!!r.include_forecast);
    setForecastPeriods(r.forecast_periods || 7);
    toast.success(`Loaded template: ${t.name}`);
  };

  const deleteTemplate = async (id) => {
    try {
      await api.delete(`/reports/templates/${id}`);
      loadTemplates();
      toast.success("Template removed");
    } catch { toast.error("Failed to delete template"); }
  };

  const setPreset = (kind) => {
    if (kind === "daily") { setAggregation("daily"); setStartDate(daysAgoIso(29)); setEndDate(todayIso()); }
    if (kind === "weekly") { setAggregation("weekly"); setStartDate(daysAgoIso(84)); setEndDate(todayIso()); }
    if (kind === "monthly") { setAggregation("monthly"); setStartDate(daysAgoIso(365)); setEndDate(todayIso()); }
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    const base = result.rows.map((r) => ({ ...r, actual: r[result.metric] }));
    if (result.forecast?.points?.length) {
      result.forecast.points.forEach((p) => {
        base.push({
          period: `+${p.step}`,
          forecast: p.value,
          lower: p.lower,
          upper: p.upper,
          band: [p.lower, p.upper],
        });
      });
    }
    return base;
  }, [result]);

  return (
    <div className="space-y-5" data-testid="reports-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 flex items-center gap-2">
            <FileBarChart2 className="h-6 w-6 text-[color:var(--brand-navy)]" />
            Reports &amp; Forecasting
          </h1>
          <p className="text-sm text-slate-500">
            Standard reports · custom filters · 95% confidence forecasts · CSV / PDF / JSON export
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreset("daily")} data-testid="preset-daily">Last 30d · Daily</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset("weekly")} data-testid="preset-weekly">12w · Weekly</Button>
          <Button variant="outline" size="sm" onClick={() => setPreset("monthly")} data-testid="preset-monthly">12mo · Monthly</Button>
        </div>
      </div>

      {/* Report picker cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(catalog?.reports || []).map((r) => {
          const Icon = ICON_FOR[r.key] || FileBarChart2;
          const active = reportType === r.key;
          return (
            <button
              key={r.key}
              data-testid={`report-tile-${r.key.toLowerCase()}`}
              onClick={() => setReportType(r.key)}
              className={`text-left rounded-lg border p-3 transition-all ${
                active
                  ? "border-[color:var(--brand-navy)] bg-[color:var(--brand-navy)] text-white shadow-md"
                  : "border-[color:var(--border)] bg-white hover:border-slate-400"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${active ? "text-white" : "text-[color:var(--brand-navy)]"}`} />
                <span className="text-[13px] font-semibold">{r.name}</span>
              </div>
              <div className={`mt-1 text-[11px] leading-snug ${active ? "text-white/70" : "text-slate-500"}`}>
                {r.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[color:var(--border)] p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Aggregation</label>
          <Select value={aggregation} onValueChange={setAggregation}>
            <SelectTrigger className="h-9 mt-1" data-testid="agg-select"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white">
              {(catalog?.aggregations || ["daily", "weekly", "monthly"]).map((a) => (
                <SelectItem key={a} value={a}>{AGG_LABEL[a] || a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Start date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 mt-1" data-testid="start-date" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">End date</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 mt-1" data-testid="end-date" />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Plant</label>
          <Select value={plantId} onValueChange={setPlantId}>
            <SelectTrigger className="h-9 mt-1" data-testid="plant-select"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white">
              <SelectItem value="all">All plants</SelectItem>
              {plants.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Metric</label>
          <Select value={metric || meta?.default_metric || ""} onValueChange={setMetric}>
            <SelectTrigger className="h-9 mt-1" data-testid="metric-select"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white">
              {(meta?.metrics || []).map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Forecast periods</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              checked={includeForecast}
              onChange={(e) => setIncludeForecast(e.target.checked)}
              data-testid="forecast-toggle"
              className="h-4 w-4"
            />
            <Input
              type="number"
              min={1} max={60}
              value={forecastPeriods}
              onChange={(e) => setForecastPeriods(e.target.value)}
              className="h-9"
              disabled={!includeForecast}
              data-testid="forecast-periods"
            />
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={runReport} disabled={loading} data-testid="run-report-btn"
                className="bg-[color:var(--brand-navy)] text-white hover:bg-[color:var(--brand-navy)]/90">
          <Play className="h-4 w-4 mr-1" /> {loading ? "Running…" : "Run report"}
        </Button>
        <Button variant="outline" onClick={() => doExport("csv")} disabled={!result} data-testid="export-csv-btn">
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" onClick={() => doExport("xlsx")} disabled={!result} data-testid="export-xlsx-btn">
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
        </Button>
        <Button variant="outline" onClick={() => doExport("pdf")} disabled={!result} data-testid="export-pdf-btn">
          <FileText className="h-4 w-4 mr-1" /> PDF
        </Button>
        <Button variant="outline" onClick={() => doExport("json")} disabled={!result} data-testid="export-json-btn">
          <FileJson className="h-4 w-4 mr-1" /> JSON
        </Button>
        <Button variant="outline" onClick={() => setSaveOpen(true)} data-testid="save-template-btn">
          <Save className="h-4 w-4 mr-1" /> Save as template
        </Button>
      </div>

      {/* Saved templates */}
      {templates.length > 0 && (
        <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-slate-800 text-sm">Saved templates</h3>
            <span className="text-[11px] text-slate-500">{templates.length} saved</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} data-testid={`template-${t.id}`}
                   className="group flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full pl-3 pr-1 py-1">
                <button onClick={() => applyTemplate(t)}
                        data-testid={`template-apply-${t.id}`}
                        className="text-xs font-medium text-slate-700 hover:text-[color:var(--brand-navy)]">
                  {t.name}
                </button>
                <Badge variant="secondary" className="text-[10px]">{t.request?.report_type}</Badge>
                <button onClick={() => deleteTemplate(t.id)}
                        data-testid={`template-delete-${t.id}`}
                        className="opacity-40 hover:opacity-100 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4" data-testid="report-result">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {result.kpis.map((k) => (
              <div key={k.label} className="bg-white rounded-lg border border-[color:var(--border)] p-4">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{k.label}</div>
                <div className="mt-1 text-2xl font-mono font-bold text-slate-900">{k.value?.toLocaleString?.() ?? k.value}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display font-semibold text-slate-800">
                {result.report_name} · {result.metric} <span className="text-slate-400 text-sm font-normal">({AGG_LABEL[result.range.aggregation]})</span>
              </h3>
              {result.forecast && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-[color:var(--brand-navy)]" />
                  Linear forecast · slope {result.forecast.slope} · ±{result.forecast.ci_half} (95% CI)
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={64} />
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="actual" name="Actual" fill="#1e3a8a" radius={[3,3,0,0]} />
                {result.forecast && (
                  <>
                    <Area type="monotone" dataKey="band" name="95% CI" stroke="none" fill="#cbd5e1" fillOpacity={0.6} />
                    <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#f97316" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
              <h3 className="font-display font-semibold text-slate-800 mb-2 text-sm">Trend data</h3>
              <div className="max-h-[320px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white">
                    <TableRow>
                      {result.columns.map((c) => (
                        <TableHead key={c.key} className="text-[11px]">{c.label}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.map((row, i) => (
                      <TableRow key={i} data-testid={`trend-row-${i}`}>
                        {result.columns.map((c) => (
                          <TableCell key={c.key} className="text-xs font-mono">{formatCell(row[c.key])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
              <h3 className="font-display font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-slate-500" />
                Breakdown
              </h3>
              {result.detail_rows?.length > 0 ? (
                <div className="max-h-[320px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white">
                      <TableRow>
                        {result.detail_columns.map((c) => (
                          <TableHead key={c.key} className="text-[11px]">{c.label}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.detail_rows.map((row, i) => (
                        <TableRow key={i} data-testid={`detail-row-${i}`}>
                          {result.detail_columns.map((c) => (
                            <TableCell key={c.key} className="text-xs font-mono">{formatCell(row[c.key])}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-slate-500 text-sm">No breakdown available for this window.</div>
              )}
            </div>
          </div>

          {result.forecast && result.forecast.points.length > 0 && (
            <div className="bg-white rounded-lg border border-[color:var(--border)] p-4">
              <h3 className="font-display font-semibold text-slate-800 mb-2 text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-500" />
                Forecast — next {result.forecast.points.length} periods
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={result.forecast.points}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="step" tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} width={60} />
                  <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0" }} />
                  <Bar dataKey="value" fill="#f97316" name="Forecast" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="bg-white">
          <DialogHeader><DialogTitle>Save as report template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm text-slate-600">Template name</label>
            <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                   placeholder="Weekly OEE — Plant A"
                   data-testid="template-name-input" />
            <div className="text-xs text-slate-500">
              Saves the current filters (report type, range, metric, aggregation, forecast).
              You can load it later with one click.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} data-testid="template-save-confirm"
                    className="bg-[color:var(--brand-navy)] text-white hover:bg-[color:var(--brand-navy)]/90">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatCell(v) {
  if (v === null || v === undefined) return "-";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}
