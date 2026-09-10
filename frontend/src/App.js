import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import AssetList from "@/pages/AssetList";
import AssetHierarchy from "@/pages/AssetHierarchy";
import Asset360 from "@/pages/Asset360";
import CXOBoard from "@/pages/CXOBoard";
import OperatorRunbook from "@/pages/OperatorRunbook";

function landingFor(role) {
  if (role === "OPERATOR") return "/operator";
  if (role === "CXO") return "/cxo";
  return "/dashboard";
}

function Protected({ children, roles }) {
  const { token, user } = useAuth();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to={landingFor(user?.role)} replace />;
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
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RoleHome />} />
          <Route path="/dashboard" element={<Protected roles={["TENANT_ADMIN", "PRODUCTION_MANAGER", "SUPERVISOR"]}><Dashboard /></Protected>} />
          <Route path="/cxo" element={<Protected roles={["CXO", "TENANT_ADMIN"]}><CXOBoard /></Protected>} />
          <Route path="/assets" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]}><AssetList /></Protected>} />
          <Route path="/assets/hierarchy" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]}><AssetHierarchy /></Protected>} />
          <Route path="/assets/:id" element={<Protected roles={["TENANT_ADMIN", "CXO", "PRODUCTION_MANAGER", "SUPERVISOR"]}><Asset360 /></Protected>} />
          <Route path="/operator" element={<BareProtected roles={["OPERATOR"]}><OperatorRunbook /></BareProtected>} />
          <Route path="*" element={<RoleHome />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
