import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("coreot_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [tenant, setTenant] = useState(() => {
    const raw = localStorage.getItem("coreot_tenant");
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem("coreot_token"));
  const [modules, setModules] = useState(() => {
    const raw = localStorage.getItem("coreot_modules");
    return raw ? JSON.parse(raw) : {};
  });

  const refreshModules = useCallback(async () => {
    try {
      const { data } = await api.get("/modules");
      const map = data.reduce((acc, m) => ({ ...acc, [m.key]: m.enabled }), {});
      setModules(map);
      localStorage.setItem("coreot_modules", JSON.stringify(map));
      return map;
    } catch (_) { return null; }
  }, []);

  useEffect(() => {
    if (token && !user) {
      api.get("/auth/me").then((r) => setUser(r.data)).catch(() => logout());
    }
    if (token) refreshModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(tenant_code, email, password) {
    const { data } = await api.post("/auth/login", { tenant_code, email, password });
    localStorage.setItem("coreot_token", data.access_token);
    localStorage.setItem("coreot_user", JSON.stringify(data.user));
    localStorage.setItem("coreot_tenant", JSON.stringify(data.tenant));
    localStorage.setItem("coreot_modules", JSON.stringify(data.modules || {}));
    setToken(data.access_token);
    setUser(data.user);
    setTenant(data.tenant);
    setModules(data.modules || {});
    return data.user;
  }

  function logout() {
    ["coreot_token", "coreot_user", "coreot_tenant", "coreot_modules", "coreot_plant"].forEach((k) => localStorage.removeItem(k));
    setToken(null);
    setUser(null);
    setTenant(null);
    setModules({});
  }

  return (
    <AuthContext.Provider value={{ user, tenant, token, modules, login, logout, refreshModules, setModules }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
