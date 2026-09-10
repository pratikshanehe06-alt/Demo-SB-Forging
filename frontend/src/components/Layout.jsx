import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Boxes, Network, Users, ShieldCheck, ToggleRight,
  KeyRound, BellRing, FileBarChart2, ClipboardList, Settings, Search, Bell, LogOut, ChevronDown
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assets", label: "Assets", icon: Boxes },
  { to: "/assets/hierarchy", label: "Asset Hierarchy", icon: Network },
  { to: "/users", label: "Users", icon: Users, disabled: true },
  { to: "/roles", label: "Roles", icon: ShieldCheck, disabled: true },
  { to: "/modules", label: "Module Access", icon: ToggleRight, disabled: true },
  { to: "/fields", label: "Field Access", icon: KeyRound, disabled: true },
  { to: "/alarms", label: "Alarms", icon: BellRing, disabled: true },
  { to: "/reports", label: "Reports", icon: FileBarChart2, disabled: true },
  { to: "/work-orders", label: "Work Orders", icon: ClipboardList, disabled: true },
  { to: "/settings", label: "Settings", icon: Settings, disabled: true },
];

export default function Layout({ children }) {
  const { user, tenant, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-[var(--workspace)]">
      {/* Top header */}
      <header className="h-16 bg-[color:var(--brand-navy)] text-white flex items-center px-6 shadow-sm">
        <Link to="/dashboard" className="flex items-center gap-2 mr-8" data-testid="coreot-logo">
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

        <div className="flex-1 max-w-lg mx-6">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              data-testid="global-search"
              placeholder="Search assets, alarms, work orders…"
              className="pl-9 h-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-white/40"
            />
          </div>
        </div>

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
            Tenant Administration
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) => cn("side-item", isActive && "active", item.disabled && "opacity-50 pointer-events-none")}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
