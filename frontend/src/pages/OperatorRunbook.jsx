import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTelemetryStream } from "@/lib/ws";
import { StatusPill } from "@/components/Pills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Thermometer, Activity, Gauge, RotateCw, Power,
  CheckCircle2, LogOut, Factory, ClipboardCheck, AlertTriangle
} from "lucide-react";

export default function OperatorRunbook() {
  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [flash, setFlash] = useState({});
  const flashTimersRef = useRef({});
  const [produced, setProduced] = useState(0);
  const [good, setGood] = useState(0);
  const [reject, setReject] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const { connected, subscribe } = useTelemetryStream(token);

  async function load() {
    const { data } = await api.get("/operator/my-machine");
    setData(data);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === "telemetry" && data && msg.asset_id === data.asset.id) {
        setData((prev) => prev ? {
          ...prev,
          asset: { ...prev.asset, status: msg.status, health: msg.health },
          telemetry: { ...prev.telemetry, ...msg.data },
        } : prev);
        const changed = {};
        Object.keys(msg.data).forEach((k) => (changed[k] = true));
        setFlash((f) => ({ ...f, ...changed }));
        Object.keys(changed).forEach((k) => {
          if (flashTimersRef.current[k]) clearTimeout(flashTimersRef.current[k]);
          flashTimersRef.current[k] = setTimeout(() => {
            setFlash((f) => { const c = { ...f }; delete c[k]; return c; });
          }, 900);
        });
      }
    });
  }, [subscribe, data]);

  async function acknowledge(alarmId) {
    try {
      await api.post(`/alarms/${alarmId}/acknowledge`);
      toast.success("Alarm acknowledged");
      load();
    } catch (e) { toast.error("Ack failed"); }
  }

  async function submitProduction() {
    if (produced <= 0) { toast.error("Enter a produced count"); return; }
    setSubmitting(true);
    try {
      await api.post("/operator/production", { produced: Number(produced), good: Number(good), reject: Number(reject) });
      toast.success(`+${produced} pcs logged`);
      setProduced(0); setGood(0); setReject(0);
      load();
    } catch (e) { toast.error("Submit failed"); }
    finally { setSubmitting(false); }
  }

  if (!data) return <div className="min-h-screen grid place-items-center text-slate-500">Loading…</div>;

  const a = data.asset;
  const t = data.telemetry;
  const running = a.status === "RUNNING";

  return (
    <div className="min-h-screen bg-[var(--workspace)]" data-testid="operator-runbook">
      {/* Simplified header for shop-floor */}
      <header className="h-16 bg-[color:var(--brand-navy)] text-white flex items-center px-6">
        <div className="flex items-center gap-2 mr-6">
          <div className="h-8 w-8 rounded-md bg-white/10 border border-white/20 grid place-items-center font-display font-black">C</div>
          <span className="font-display font-bold text-lg">CoreOT<sup className="text-[10px]">™</sup></span>
          <span className="ml-4 text-xs uppercase tracking-wider bg-white/10 px-2 py-1 rounded">Operator</span>
        </div>
        <div className="flex-1" />
        <div className="text-sm mr-4">
          <div className="font-medium">{user?.name}</div>
          <div className="text-[10px] text-white/70">{a.area_name} · {a.plant_name}</div>
        </div>
        <button onClick={() => { logout(); navigate("/login"); }} data-testid="operator-logout" className="h-9 px-3 rounded-md hover:bg-white/10 flex items-center gap-1 text-sm">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Big machine status card */}
        <div className="bg-white rounded-xl border border-[color:var(--border)] p-8">
          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className={`h-40 w-40 rounded-full grid place-items-center border-8 ${
              running ? "border-emerald-500 bg-emerald-50" :
              a.status === "WARNING" ? "border-amber-500 bg-amber-50" :
              a.status === "CRITICAL" ? "border-red-600 bg-red-50 animate-pulse" :
              a.status === "FAULT" ? "border-red-500 bg-red-50" :
              "border-slate-400 bg-slate-50"}`}>
              <Factory className="h-20 w-20 text-slate-700" strokeWidth={1.3} />
            </div>
            <div className="flex-1">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Your assigned machine</div>
              <div className="mt-1 flex items-center gap-3">
                <h1 className="font-display font-black text-4xl">{a.asset_code}</h1>
                <StatusPill status={a.status} className="text-sm px-3 py-1" />
              </div>
              <div className="text-slate-600 text-lg mt-1">{a.name}</div>
              <div className="mt-3 flex items-center gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Health</div>
                  <div className={`font-mono font-bold text-3xl ${a.health >= 80 ? "text-emerald-600" : a.health >= 60 ? "text-amber-600" : "text-red-600"}`}>{a.health}%</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Live</div>
                  <div className={`font-mono font-bold text-sm mt-2 ${connected ? "text-emerald-600" : "text-slate-500"}`}>{connected ? "● CONNECTED" : "○ OFFLINE"}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Live parameters */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <BigMetric label="Temp °C" value={t.temperature} icon={Thermometer} color="text-red-600" flash={flash.temperature} />
          <BigMetric label="Vibration" value={t.vibration} icon={Activity} color="text-amber-600" flash={flash.vibration} />
          <BigMetric label="RPM" value={t.rpm} icon={RotateCw} color="text-purple-600" decimals={0} flash={flash.rpm} />
          <BigMetric label="Pressure" value={t.pressure} icon={Gauge} color="text-blue-600" flash={flash.pressure} />
          <BigMetric label="Power kW" value={t.power} icon={Power} color="text-emerald-600" flash={flash.power} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Production input */}
          <div className="bg-white rounded-xl border border-[color:var(--border)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="h-5 w-5 text-[color:var(--brand-navy)]" />
              <h2 className="font-display font-bold text-xl">Log Production</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <NumInput label="Produced" value={produced} onChange={setProduced} testid="op-produced" />
              <NumInput label="Good" value={good} onChange={setGood} testid="op-good" />
              <NumInput label="Reject" value={reject} onChange={setReject} testid="op-reject" />
            </div>
            <Button onClick={submitProduction} disabled={submitting} data-testid="op-submit" className="w-full mt-4 h-12 text-base bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)]">
              {submitting ? "Submitting…" : "Log this batch"}
            </Button>
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center">
              <Stat label="Total" value={t.production_count ?? 0} color="text-slate-900" />
              <Stat label="Good" value={t.good_count ?? 0} color="text-emerald-700" />
              <Stat label="Reject" value={t.reject_count ?? 0} color="text-red-700" />
            </div>
          </div>

          {/* Alarms */}
          <div className="bg-white rounded-xl border border-[color:var(--border)] p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="font-display font-bold text-xl">Active Alarms</h2>
              <span className="ml-auto text-xs text-slate-500">{data.alarms.length} open</span>
            </div>
            {data.alarms.length === 0 ? (
              <div className="text-center py-8 text-emerald-600">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-2" />
                <div className="font-semibold">No active alarms</div>
                <div className="text-xs text-slate-500 mt-1">Your machine is running clean</div>
              </div>
            ) : (
              <div className="space-y-2">
                {data.alarms.map((al) => (
                  <div key={al.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <div className="text-xs uppercase tracking-wider font-semibold text-red-600">{al.severity}</div>
                      <div className="font-semibold text-slate-800">{al.message}</div>
                      <div className="text-[11px] text-slate-500">{new Date(al.created_at).toLocaleString()}</div>
                    </div>
                    <Button data-testid={`op-ack-${al.id}`} onClick={() => acknowledge(al.id)} className="bg-emerald-600 hover:bg-emerald-700 h-10">
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Acknowledge
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function BigMetric({ label, value, icon: Icon, color, decimals = 2, flash }) {
  const v = value !== undefined && value !== null ? Number(value).toFixed(decimals) : "--";
  return (
    <div className={`bg-white rounded-lg border border-[color:var(--border)] p-4 text-center ${flash ? "telemetry-flash" : ""}`}>
      <div className="flex items-center justify-center gap-1 text-[11px] uppercase tracking-wider font-semibold text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${color}`} /> {label}
      </div>
      <div className="mt-1 font-mono font-bold text-3xl tabular text-slate-900">{v}</div>
    </div>
  );
}

function NumInput({ label, value, onChange, testid }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">{label}</Label>
      <Input type="number" data-testid={testid} min={0} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 h-11 font-mono text-lg text-center" />
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`font-mono font-bold text-2xl ${color}`}>{value}</div>
    </div>
  );
}
