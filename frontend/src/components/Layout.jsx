import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Boxes, Network, Users, ShieldCheck, ToggleRight,
  KeyRound, BellRing, FileBarChart2, ClipboardList, Settings, Search, Bell, LogOut, ChevronDown,
  TrendingUp, ShieldAlert, Factory, FileSpreadsheet, Flame, LayoutGrid, HeartPulse, Wrench, Activity, Sun, Droplet,
  Package, ClipboardCheck, UserCheck, IndianRupee,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePlant } from "@/lib/plantContext";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTelemetryStream } from "@/lib/ws";

const WORKSPACES = {
  APM: { label: "APM Workspace", icon: LayoutGrid, home: "/dashboard" },
  FIRE_SAFETY: { label: "Fire & Safety Workspace", icon: Flame, home: "/fire-safety" },
};

function navForApm(role, modules) {
  const items = [];
  if (role === "CXO") items.push({ to: "/cxo", label: "CXO Board", icon: TrendingUp });
  if (["TENANT_ADMIN", "PRODUCTION_MANAGER", "SUPERVISOR"].includes(role)) {
    items.push({ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard });
  }
  if (role === "TENANT_ADMIN") items.push({ to: "/cxo", label: "CXO Board", icon: TrendingUp });

  if (modules?.APM !== false) {
    items.push({
      section: "APM", label: "APM", icon: Boxes,
      children: [
        { to: "/assets", label: "Asset Status – List", icon: Boxes },
        { to: "/assets/health", label: "Asset Health Overview", icon: HeartPulse },
        { to: "/assets/predictive", label: "Predictive Maintenance", icon: Wrench },
        { to: "/assets/hierarchy", label: "Asset Hierarchy", icon: Network },
        { to: "/assets/compare", label: "Asset Comparison", icon: TrendingUp },
        { to: "/alarms", label: "Alarms & Events", icon: BellRing },
      ],
    });
  }
  items.push({ to: "/work-orders", label: "Work Orders", icon: ClipboardList, disabled: true });
  return items;
}

function navForFireSafety() {
  return [
    { to: "/fire-safety", label: "Command Center", icon: Flame },
    {
      section: "Fire Assets", label: "Assets", icon: ShieldAlert,
      children: [
        { to: "/fire-safety/assets", label: "Asset Status", icon: ShieldAlert },
        { to: "/fire-safety/assets/health", label: "Asset Health Overview", icon: HeartPulse },
        { to: "/fire-safety/assets/predictive", label: "Predictive Maintenance", icon: Wrench },
        { to: "/fire-safety/zones", label: "Fire Zones", icon: Network },
        { to: "/fire-safety/assets/compare", label: "Asset Comparison", icon: TrendingUp },
        { to: "/fire-safety/alarms", label: "Alarms & Events", icon: BellRing },
      ],
    },
    { to: "/fire-safety/incidents", label: "Incidents", icon: ClipboardList },
  ];
}

function navCommonModules(modules) {
  // Independent modules — not tied to either APM or Fire & Safety, so
  // they stay visible no matter which workspace is active.
  const items = [];
  if (modules?.OEE_APS) items.push({ to: "/oee", label: "OEE & APS", icon: Settings });
  if (modules?.EEMS) {
    items.push({
      section: "EEMS", label: "EEMS", icon: FileBarChart2,
      children: [
        { to: "/eems", label: "EMS Overview", icon: FileBarChart2 },
        { to: "/pqi", label: "PQI Overview", icon: Activity },
        { to: "/derms", label: "DERMS Overview", icon: Sun },
        { to: "/ums", label: "UMS Overview", icon: Droplet },
      ],
    });
  }
  if (modules?.SMART_INVENTORY) items.push({ to: "/inventory", label: "Smart Inventory", icon: Package });
  if (modules?.TQC) items.push({ to: "/tqc", label: "TQC", icon: ClipboardCheck });
  if (modules?.DIGITAL_WORKFORCE) items.push({ to: "/workforce", label: "Digital Workforce", icon: UserCheck });
  if (modules?.FINANCIAL_INTELLIGENCE) items.push({ to: "/finance", label: "Financial Intelligence", icon: IndianRupee });
  if (modules?.AI_COPILOT) items.push({ to: "/copilot", label: "AI Copilot", icon: ShieldCheck, disabled: true });
  return items;
}

function navShared(role, modules) {
  // Items common to every workspace: users, reports, audit, admin
  const items = [];
  if (["TENANT_ADMIN", "SUPERVISOR", "PRODUCTION_MANAGER"].includes(role)) {
    items.push({ to: "/users", label: "Users", icon: Users });
  }
  if (role === "TENANT_ADMIN") items.push({ to: "/modules", label: "Module Access", icon: ToggleRight });
  if (modules?.REPORTS) items.push({ to: "/reports", label: "Reports", icon: FileSpreadsheet });
  if (modules?.AUDIT && role === "TENANT_ADMIN") items.push({ to: "/audit", label: "Audit Logs", icon: KeyRound });
  items.push({ to: "/settings", label: "Settings", icon: Settings, disabled: true });
  return items;
}

function navFor(role, modules, workspace) {
  const workspaceItems = workspace === "FIRE_SAFETY" ? navForFireSafety() : navForApm(role, modules);
  return [...workspaceItems, ...navCommonModules(modules), ...navShared(role, modules)];
}

export default function Layout({ children }) {
  const { user, tenant, logout, token, modules, refreshModules } = useAuth();
  const { plants, selectedPlantId, selectPlant } = usePlant();
  const navigate = useNavigate();
  const location = useLocation();
  const [escalations, setEscalations] = useState([]);
  const { subscribe } = useTelemetryStream(token);

  useEffect(() => {
    api.get("/escalations", { params: { limit: 20 } }).then((r) => setEscalations(r.data)).catch(() => {});
    return subscribe((msg) => {
      if (msg.type === "escalation") setEscalations((e) => [msg.event, ...e].slice(0, 20));
      if (msg.type === "modules") refreshModules();
    });
  }, [subscribe, refreshModules]);

  const hasBothWorkspaces = modules?.APM !== false && modules?.FIRE_SAFETY === true;

  // Workspace is sticky (persisted), not re-derived from every URL change.
  // Otherwise clicking a shared page (Users, Reports, Settings — none of
  // which live under /fire-safety/*) would silently flip the sidebar back
  // to APM even though the user never left the Fire & Safety workspace.
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    if (typeof window === "undefined") return "APM";
    const stored = window.localStorage.getItem("coreot_workspace");
    if (stored && WORKSPACES[stored]) return stored;
    return location.pathname.startsWith("/fire-safety") ? "FIRE_SAFETY" : "APM";
  });

  // If the user lands directly on a /fire-safety/* URL (bookmark, refresh,
  // direct link) while the stored workspace says APM, sync to Fire so the
  // sidebar matches what they're actually looking at.
  useEffect(() => {
    if (location.pathname.startsWith("/fire-safety") && activeWorkspace !== "FIRE_SAFETY") {
      setActiveWorkspace("FIRE_SAFETY");
      window.localStorage.setItem("coreot_workspace", "FIRE_SAFETY");
    }
  }, [location.pathname, activeWorkspace]);

  // If a tenant loses access to a workspace (module toggled off) while it's
  // the active one, fall back to APM so we don't get stuck on a dead workspace.
  useEffect(() => {
    if (activeWorkspace === "FIRE_SAFETY" && modules?.FIRE_SAFETY === false) {
      setActiveWorkspace("APM");
      window.localStorage.setItem("coreot_workspace", "APM");
    }
  }, [activeWorkspace, modules]);

  const workspaceMeta = WORKSPACES[activeWorkspace];
  const NAV = navFor(user?.role, modules, activeWorkspace);
  const showPlantSwitcher = ["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"].includes(user?.role) && activeWorkspace === "APM";
  const selectedPlant = plants.find((p) => p.id === selectedPlantId);

  function switchWorkspace(key) {
    if (key === activeWorkspace) return;
    setActiveWorkspace(key);
    window.localStorage.setItem("coreot_workspace", key);
    navigate(WORKSPACES[key].home);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--workspace)]">
      {/* Top header */}
      <header className="h-16 bg-[color:var(--brand-navy)] text-white flex items-center px-6 shadow-sm">
        <Link to="/" className="flex items-center gap-2 mr-6" data-testid="coreot-logo">
          <div className="h-8 w-8 rounded-md bg-white/10 border border-white/20 grid place-items-center font-display font-black">C</div>
          <span className="font-display font-bold text-lg tracking-tight">CoreOT<sup className="text-[10px]">™</sup></span>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="tenant-selector" className="flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 px-3 h-9 text-sm">
              <span className="font-medium">{tenant?.name || "Tenant"}</span>
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-white">
            <DropdownMenuLabel>Tenants</DropdownMenuLabel>
            <DropdownMenuItem>{tenant?.name}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {hasBothWorkspaces && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="workspace-switcher" className="ml-2 flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 px-3 h-9 text-sm">
                <workspaceMeta.icon className="h-4 w-4" />
                <span className="font-medium">{workspaceMeta.label}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 bg-white">
              <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(WORKSPACES).map(([key, w]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => switchWorkspace(key)}
                  data-testid={`workspace-option-${key.toLowerCase()}`}
                  className={cn("flex items-center gap-2", key === activeWorkspace && "bg-slate-100 font-medium")}
                >
                  <w.icon className="h-4 w-4" />
                  <span>{w.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {showPlantSwitcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="plant-switcher" className="ml-2 flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/15 border border-white/20 px-3 h-9 text-sm">
                <Factory className="h-4 w-4" />
                <span className="font-medium">{selectedPlant ? selectedPlant.name : "All Plants"}</span>
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-white">
              <DropdownMenuLabel>Plant filter</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => selectPlant("all")} data-testid="plant-option-all">
                All Plants
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {plants.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => selectPlant(p.id)} data-testid={`plant-option-${p.code}`}>
                  <div className="flex flex-col">
                    <span>{p.name}</span>
                    <span className="text-[10px] text-slate-500">{p.location}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1 max-w-md mx-6">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="global-search"
              placeholder="Search assets, alarms, work orders…"
              className="pl-9 h-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/40"
            />
          </div>
        </div>

        {/* Escalation bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="escalations-btn" className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-white/10 mr-1">
              <ShieldAlert className="h-5 w-5" />
              {escalations.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] font-bold grid place-items-center border border-[color:var(--brand-navy)] px-1">
                  {escalations.length > 9 ? "9+" : escalations.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-96 bg-white">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Auto-Escalations</span>
              <span className="text-[10px] text-slate-500 font-normal">Unacked &gt; 5 min</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {escalations.length === 0 ? (
              <div className="p-3 text-sm text-slate-500 text-center">No escalations 🎉</div>
            ) : escalations.slice(0, 8).map((e) => (
              <DropdownMenuItem key={e.id} className="flex flex-col items-start gap-0.5 py-2">
                <div className="text-xs uppercase tracking-wider font-semibold text-red-600">{e.severity} · {e.asset_code}</div>
                <div className="text-sm font-medium text-slate-800">{e.message}</div>
                <div className="text-[10px] text-slate-500">{new Date(e.escalated_at).toLocaleString()} · logged to {e.recipient}</div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button data-testid="notif-btn" className="relative h-9 w-9 grid place-items-center rounded-md hover:bg-white/10">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400 border border-[color:var(--brand-navy)]" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="user-menu" className="ml-3 flex items-center gap-2 rounded-md hover:bg-white/10 px-2 h-9">
              <div className="h-7 w-7 rounded-full bg-white/20 grid place-items-center text-xs font-semibold">
                {user?.name?.split(" ").map((x) => x[0]).slice(0, 2).join("") || "U"}
              </div>
              <div className="text-left leading-tight">
                <div className="text-sm font-medium">{user?.name}</div>
                <div className="text-[10px] text-white/70">{user?.role?.replace("_", " ")}</div>
              </div>
              <ChevronDown className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 bg-white">
            <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { logout(); navigate("/login"); }} data-testid="logout-btn">
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-[color:var(--border)] py-4 px-3">
          <div className="text-[10px] uppercase tracking-[0.14em] font-semibold text-slate-400 px-3 mb-2">
            {activeWorkspace === "FIRE_SAFETY"
              ? "Fire & Safety"
              : user?.role === "CXO" ? "Executive" : "Tenant Administration"}
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              item.section ? (
                <SidebarSection key={item.section} item={item} />
              ) : !item.to ? (
                // Inert placeholder — no route yet, so no NavLink at all
                // (avoids falling through to the catch-all route).
                <div
                  key={item.label}
                  data-testid={`nav-${item.label.toLowerCase().replace(/[\s&]+/g, "-")}`}
                  className="side-item opacity-50 cursor-not-allowed select-none"
                  title="Coming soon"
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </div>
              ) : (
                <NavLink
                  key={item.to + item.label}
                  to={item.to}
                  end
                  data-testid={`nav-${item.label.toLowerCase().replace(/[\s&]+/g, "-")}`}
                  className={({ isActive }) => cn("side-item", isActive && "active", item.disabled && "opacity-50 pointer-events-none")}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              )
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

function SidebarSection({ item }) {
  const location = typeof window !== "undefined" ? window.location.pathname : "";
  const activeInSection = item.children.some((c) => location === c.to || location.startsWith(c.to + "/"));
  const [open, setOpen] = useState(activeInSection);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid={`nav-section-${item.section.toLowerCase()}`}
        className={cn("side-item w-full justify-between", activeInSection && "active")}
      >
        <span className="flex items-center gap-2.5">
          <item.icon className="h-4 w-4" />
          <span className="font-semibold">{item.label}</span>
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-0.5 ml-3 pl-2 border-l border-slate-200 flex flex-col gap-0.5">
          {item.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              end
              data-testid={`nav-${c.label.toLowerCase().replace(/[\s&]+/g, "-")}`}
              className={({ isActive }) => cn("side-item text-[13px]", isActive && "active")}
            >
              <c.icon className="h-3.5 w-3.5" />
              <span>{c.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
