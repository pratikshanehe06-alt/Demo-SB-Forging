import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PlantProvider } from "@/lib/plantContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AssetList from "@/pages/AssetList";
import AssetHierarchy from "@/pages/AssetHierarchy";
import Asset360 from "@/pages/Asset360";
import AssetCompare from "@/pages/AssetCompare";
import CXOBoard from "@/pages/CXOBoard";
import OperatorRunbook from "@/pages/OperatorRunbook";
import ModulesPage from "@/pages/ModulesPage";
import UsersPage from "@/pages/UsersPage";
import EEMSPage from "@/pages/EEMSPage";
import OEEPage from "@/pages/OEEPage";
import AuditPage from "@/pages/AuditPage";
import PlatformAdmin from "@/pages/PlatformAdmin";

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
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RoleHome />} />
            <Route path="/dashboard" element={<Protected roles={["TENANT_ADMIN", "PRODUCTION_MANAGER", "SUPERVISOR"]}><Dashboard /></Protected>} />
            <Route path="/cxo" element={<Protected roles={["CXO", "TENANT_ADMIN"]}><CXOBoard /></Protected>} />
            <Route path="/assets" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetList /></Protected>} />
            <Route path="/assets/hierarchy" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetHierarchy /></Protected>} />
            <Route path="/assets/compare" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><AssetCompare /></Protected>} />
            <Route path="/assets/:id" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="APM"><Asset360 /></Protected>} />
            <Route path="/eems" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER"]} requireModule="EEMS"><EEMSPage /></Protected>} />
            <Route path="/oee" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]} requireModule="OEE_APS"><OEEPage /></Protected>} />
            <Route path="/audit" element={<Protected roles={["TENANT_ADMIN"]} requireModule="AUDIT"><AuditPage /></Protected>} />
            <Route path="/users" element={<Protected roles={["TENANT_ADMIN", "SUPERVISOR", "PRODUCTION_MANAGER"]}><UsersPage /></Protected>} />
            <Route path="/modules" element={<Protected roles={["TENANT_ADMIN"]}><ModulesPage /></Protected>} />
            <Route path="/operator" element={<BareProtected roles={["OPERATOR"]}><OperatorRunbook /></BareProtected>} />
            <Route path="/platform" element={<BareProtected roles={["PLATFORM_SUPER_ADMIN"]}><PlatformAdmin /></BareProtected>} />
            <Route path="*" element={<RoleHome />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </PlantProvider>
    </AuthProvider>
  );
}
