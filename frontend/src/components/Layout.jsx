import { Link, NavLink, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Boxes, Network, Users, ShieldCheck, ToggleRight,
  KeyRound, BellRing, FileBarChart2, ClipboardList, Settings, Search, Bell, LogOut, ChevronDown,
  TrendingUp, ShieldAlert, Factory, FileSpreadsheet
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

function navFor(role, modules) {
  const items = [];
  if (role === "CXO") items.push({ to: "/cxo", label: "CXO Board", icon: TrendingUp });
  if (["TENANT_ADMIN", "PRODUCTION_MANAGER", "SUPERVISOR"].includes(role)) {
    items.push({ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard });
  }
  if (role === "TENANT_ADMIN") items.push({ to: "/cxo", label: "CXO Board", icon: TrendingUp });

  // APM section
  if (modules?.APM !== false) {
    items.push({
      section: "APM", label: "APM", icon: Boxes,
      children: [
        { to: "/assets", label: "Assets", icon: Boxes },
        { to: "/assets/hierarchy", label: "Asset Hierarchy", icon: Network },
        { to: "/assets/compare", label: "Asset Comparison", icon: TrendingUp },
      ],
    });
  }
  // Users - Tenant Admin, Supervisor, Production Manager
  if (["TENANT_ADMIN", "SUPERVISOR", "PRODUCTION_MANAGER"].includes(role)) {
    items.push({ to: "/users", label: "Users", icon: Users });
  }
  if (role === "TENANT_ADMIN") items.push({ to: "/modules", label: "Module Access", icon: ToggleRight });

  if (modules?.OEE_APS) items.push({ to: "/oee", label: "OEE & APS", icon: Settings });
  if (modules?.EEMS) items.push({ to: "/eems", label: "EEMS", icon: FileBarChart2 });
  if (modules?.AI_COPILOT) items.push({ to: "/copilot", label: "AI Copilot", icon: ShieldCheck, disabled: true });
  if (modules?.REPORTS) items.push({ to: "/reports", label: "Reports", icon: FileSpreadsheet });
  if (modules?.AUDIT && role === "TENANT_ADMIN") items.push({ to: "/audit", label: "Audit Logs", icon: KeyRound });

  items.push({ to: "/alarms", label: "Alarms", icon: BellRing, disabled: true });
  items.push({ to: "/work-orders", label: "Work Orders", icon: ClipboardList, disabled: true });
  items.push({ to: "/settings", label: "Settings", icon: Settings, disabled: true });
  return items;
}

export default function Layout({ children }) {
  const { user, tenant, logout, token, modules, refreshModules } = useAuth();
  const { plants, selectedPlantId, selectPlant } = usePlant();
  const navigate = useNavigate();
  const [escalations, setEscalations] = useState([]);
  const { subscribe } = useTelemetryStream(token);

  useEffect(() => {
    api.get("/escalations", { params: { limit: 20 } }).then((r) => setEscalations(r.data)).catch(() => {});
    return subscribe((msg) => {
      if (msg.type === "escalation") setEscalations((e) => [msg.event, ...e].slice(0, 20));
      if (msg.type === "modules") refreshModules();
    });
  }, [subscribe, refreshModules]);

  const NAV = navFor(user?.role, modules);
  const showPlantSwitcher = ["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"].includes(user?.role);
  const selectedPlant = plants.find((p) => p.id === selectedPlantId);

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
            {user?.role === "CXO" ? "Executive" : "Tenant Administration"}
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              item.section ? (
                <SidebarSection key={item.section} item={item} />
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
