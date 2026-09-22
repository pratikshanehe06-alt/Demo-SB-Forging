import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Factory } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";

// Fallback only used if /api/tenants can't be reached (e.g. backend down).
const FALLBACK_TENANTS = [
  { code: "SBF", name: "SB Forgtech Pvt Ltd" },
  { code: "PLATFORM", name: "CoreOT Platform (Super Admin)" },
];

const DEMO_CREDS = [
  { role: "Super Admin", email: "superadmin@coreot.com", pwd: "Super@123", tenant: "PLATFORM" },
  { role: "Tenant Admin", email: "tenantadmin@sbforgtech.com", pwd: "Admin@123", tenant: "SBF" },
  { role: "CXO", email: "cxo@sbforgtech.com", pwd: "Cxo@123", tenant: "SBF" },
  { role: "Production Manager", email: "production@sbforgtech.com", pwd: "Prod@123", tenant: "SBF" },
  { role: "Supervisor", email: "supervisor@sbforgtech.com", pwd: "Super@123", tenant: "SBF" },
  { role: "Operator", email: "operator@sbforgtech.com", pwd: "Operator@123", tenant: "SBF" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState(FALLBACK_TENANTS);
  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [tenantCode, setTenantCode] = useState("SBF");
  const [email, setEmail] = useState("tenantadmin@sbforgtech.com");
  const [password, setPassword] = useState("Admin@123");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/tenants")
      .then((r) => {
        if (r.data && r.data.length > 0) {
          setTenants(r.data);
          // Keep current selection if it still exists, otherwise default to the first tenant
          setTenantCode((prev) => (r.data.some((t) => t.code === prev) ? prev : r.data[0].code));
        }
      })
      .catch(() => {
        // silently fall back to FALLBACK_TENANTS already in state
      })
      .finally(() => setTenantsLoading(false));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(tenantCode, email, password);
      toast.success("Welcome back");
      const dest =
        u.role === "OPERATOR" ? "/operator"
        : u.role === "CXO" ? "/cxo"
        : u.role === "PLATFORM_SUPER_ADMIN" ? "/platform"
        : "/dashboard";
      navigate(dest);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(c) {
    setEmail(c.email);
    setPassword(c.pwd);
    setTenantCode(c.tenant || "SBF");
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-5 bg-white">
      {/* Left illustration panel */}
      <div className="hidden lg:flex lg:col-span-2 login-illustration relative flex-col justify-between p-10">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-[color:var(--brand-navy)] grid place-items-center text-white font-display font-black">C</div>
            <span className="font-display font-bold text-2xl text-[color:var(--brand-navy)]">CoreOT<sup className="text-xs">™</sup></span>
          </div>
          <p className="mt-2 text-slate-600 font-medium">Industrial Intelligence Platform</p>
        </div>

        <div className="my-10">
          <h1 className="font-display font-black text-4xl leading-tight text-[color:var(--brand-navy)]">
            Connect. Analyze.<br />Transform. Automate.<br />Humanize.
          </h1>
          <div className="mt-8 flex items-end gap-2 opacity-90">
            <Factory className="h-24 w-24 text-[color:var(--brand-navy)]/40" strokeWidth={1.4} />
            <svg viewBox="0 0 200 100" className="h-24 w-56 text-[color:var(--brand-navy)]/40" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M0 90 L20 90 L20 50 L40 50 L40 30 L60 30 L60 60 L80 60 L80 40 L100 40 L100 20 L120 20 L120 55 L140 55 L140 35 L160 35 L160 70 L200 70 L200 90 Z" />
              <circle cx="46" cy="20" r="3" /><circle cx="106" cy="10" r="3" />
              <path d="M46 20 L46 30" /><path d="M106 10 L106 20" />
            </svg>
          </div>
        </div>

        <div className="text-xs text-slate-500">© 2026 CoreOT™ · All rights reserved.</div>
      </div>

      {/* Right form panel */}
      <div className="lg:col-span-3 flex items-center justify-center p-6 lg:p-16">
        <div className="w-full max-w-md">
          <h2 className="font-display font-black text-3xl">Welcome Back!</h2>
          <p className="text-sm text-slate-500 mt-1">Sign in to your CoreOT account</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Tenant / Company</Label>
              <Select value={tenantCode} onValueChange={setTenantCode} disabled={tenantsLoading}>
                <SelectTrigger data-testid="login-tenant" className="mt-1.5 bg-white h-11">
                  <SelectValue placeholder={tenantsLoading ? "Loading tenants…" : "Select company"} />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  {tenants.map((t) => (
                    <SelectItem key={t.code} value={t.code}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Email / Username</Label>
              <Input data-testid="login-email" className="mt-1.5 h-11" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider font-semibold text-slate-600">Password</Label>
              <div className="relative mt-1.5">
                <Input data-testid="login-password" type={showPwd ? "text" : "password"} className="h-11 pr-10" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" />
                <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <Checkbox data-testid="remember-me" checked={remember} onCheckedChange={setRemember} />
                Remember me
              </label>
              <a href="#" className="text-[color:var(--brand-blue)] font-medium hover:underline">Forgot Password?</a>
            </div>

            <Button data-testid="login-submit" disabled={loading} className="w-full h-11 bg-[color:var(--brand-navy)] hover:bg-[color:var(--brand-navy-deep)] text-white font-semibold">
              {loading ? "Signing in…" : "Sign In"}
            </Button>
          </form>

          <div className="mt-8 border-t pt-4">
            <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Demo accounts (click to fill)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {DEMO_CREDS.map((c) => (
                <button
                  type="button"
                  key={c.email}
                  onClick={() => fillDemo(c)}
                  className="text-left rounded-md border border-slate-200 hover:border-[color:var(--brand-blue)] bg-white p-2 text-xs"
                >
                  <div className="font-semibold text-slate-800">{c.role}</div>
                  <div className="text-slate-500 font-mono text-[10px]">{c.email}</div>
                </button>
              ))}
            </div>
          </div>

          <p className="text-center text-xs text-slate-500 mt-8">Secure. Scalable. Smart.</p>
        </div>
      </div>
    </div>
  );
}
