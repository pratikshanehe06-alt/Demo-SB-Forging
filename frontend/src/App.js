import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PlantProvider } from "@/lib/plantContext";
import { KioskProvider } from "@/lib/kioskContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AssetList from "@/pages/AssetList";
import AssetHierarchy from "@/pages/AssetHierarchy";
import AssetHealthOverview from "@/pages/AssetHealthOverview";
import AssetPredictiveMaintenance from "@/pages/AssetPredictiveMaintenance";
import AlarmsPage from "@/pages/AlarmsPage";
import Asset360 from "@/pages/Asset360";
import CXOBoard from "@/pages/CXOBoard";
import OperatorRunbook from "@/pages/OperatorRunbook";
import ModulesPage from "@/pages/ModulesPage";
import UsersPage from "@/pages/UsersPage";
import EEMSPage from "@/pages/EEMSPage";
import PQIPage from "@/pages/PQIPage";
import DERMSPage from "@/pages/DERMSPage";
import UMSPage from "@/pages/UMSPage";
import InventoryPage from "@/pages/InventoryPage";
import TQCPage from "@/pages/TQCPage";
import WorkforcePage from "@/pages/WorkforcePage";
import FinancePage from "@/pages/FinancePage";
import OEEPage from "@/pages/OEEPage";
import AuditPage from "@/pages/AuditPage";
import PlatformAdmin from "@/pages/PlatformAdmin";
import ReportsPage from "@/pages/ReportsPage";
import FireSafety from "@/pages/FireSafety";
import FireZones from "@/pages/FireZones";
import FireAssetStatus from "@/pages/FireAssetStatus";
import FireAssetHealth from "@/pages/FireAssetHealth";
import FirePredictiveMaintenance from "@/pages/FirePredictiveMaintenance";
import FireAssetDetail from "@/pages/FireAssetDetail";
import FireAssetCompare from "@/pages/FireAssetCompare";
import FireAlarmEvents from "@/pages/FireAlarmEvents";
import FireIncidents from "@/pages/FireIncidents";

function landingFor(role) {
  if (role === "OPERATOR") return "/operator";
  if (role === "CXO") return "/cxo";
  if (role === "PLATFORM_SUPER_ADMIN") return "/platform";
  return "/dashboard";
}

function Protected({ children, roles, requireModule }) {
  const { token, user, modules } = useAuth();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to={landingFor(user?.role)} replace />;
  if (requireModule && modules && modules[requireModule] === false) return <Navigate to={landingFor(user?.role)} replace />;
  return <Layout>{children}</Layout>;
}

function BareProtected({ children, roles }) {
  const { token, user } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to={landingFor(user?.role)} replace />;
  return children;
}

function RoleHome() {
  const { user, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to={landingFor(user?.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <PlantProvider>
        <KioskProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RoleHome />} />
            <Route path="/dashboard" element={<Protected roles={["TENANT_ADMIN", "PRODUCTION_MANAGER", "SUPERVISOR"]}><Dashboard /></Protected>} />
            <Route path="/cxo" element={<Protected roles={["CXO", "TENANT_ADMIN"]}><CXOBoard /></Protected>} />
            <Route path="/assets" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetList /></Protected>} />
            <Route path="/assets/health" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetHealthOverview /></Protected>} />
            <Route path="/assets/predictive" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetPredictiveMaintenance /></Protected>} />
            <Route path="/assets/hierarchy" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetHierarchy /></Protected>} />
            <Route path="/alarms" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AlarmsPage /></Protected>} />
            <Route path="/assets/:id" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><Asset360 /></Protected>} />
            <Route path="/eems" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"]} requireModule="EEMS"><EEMSPage /></Protected>} />
            <Route path="/pqi" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"]} requireModule="EEMS"><PQIPage /></Protected>} />
            <Route path="/derms" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"]} requireModule="EEMS"><DERMSPage /></Protected>} />
            <Route path="/ums" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"]} requireModule="EEMS"><UMSPage /></Protected>} />
            <Route path="/inventory" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="SMART_INVENTORY"><InventoryPage /></Protected>} />
            <Route path="/tqc" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="TQC"><TQCPage /></Protected>} />
            <Route path="/workforce" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="DIGITAL_WORKFORCE"><WorkforcePage /></Protected>} />
            <Route path="/finance" element={<Protected roles={["TENANT_ADMIN", "CXO"]} requireModule="FINANCIAL_INTELLIGENCE"><FinancePage /></Protected>} />
            <Route path="/oee" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="OEE_APS"><OEEPage /></Protected>} />
            <Route path="/fire-safety" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireSafety /></Protected>} />
            <Route path="/fire-safety/zones" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireZones /></Protected>} />
            <Route path="/fire-safety/assets" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireAssetStatus /></Protected>} />
            <Route path="/fire-safety/assets/health" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireAssetHealth /></Protected>} />
            <Route path="/fire-safety/assets/predictive" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FirePredictiveMaintenance /></Protected>} />
            <Route path="/fire-safety/assets/compare" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireAssetCompare /></Protected>} />
            <Route path="/fire-safety/alarms" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireAlarmEvents /></Protected>} />
            <Route path="/fire-safety/assets/:id" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireAssetDetail /></Protected>} />
            <Route path="/fire-safety/incidents" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="FIRE_SAFETY"><FireIncidents /></Protected>} />
            <Route path="/audit" element={<Protected roles={["TENANT_ADMIN"]} requireModule="AUDIT"><AuditPage /></Protected>} />
            <Route path="/reports" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"]} requireModule="REPORTS"><ReportsPage /></Protected>} />
            <Route path="/users" element={<Protected roles={["TENANT_ADMIN", "SUPERVISOR", "PRODUCTION_MANAGER"]}><UsersPage /></Protected>} />
            <Route path="/modules" element={<Protected roles={["TENANT_ADMIN"]}><ModulesPage /></Protected>} />
            <Route path="/operator" element={<BareProtected roles={["OPERATOR"]}><OperatorRunbook /></BareProtected>} />
            <Route path="/platform" element={<BareProtected roles={["PLATFORM_SUPER_ADMIN"]}><PlatformAdmin /></BareProtected>} />
            <Route path="*" element={<RoleHome />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
        </KioskProvider>
      </PlantProvider>
    </AuthProvider>
  );
}
