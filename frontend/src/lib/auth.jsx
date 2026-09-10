import { createContext, useContext, useEffect, useState } from "react";
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

  useEffect(() => {
    if (token && !user) {
      api.get("/auth/me").then((r) => setUser(r.data)).catch(() => logout());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(tenant_code, email, password) {
    const { data } = await api.post("/auth/login", { tenant_code, email, password });
    localStorage.setItem("coreot_token", data.access_token);
    localStorage.setItem("coreot_user", JSON.stringify(data.user));
    localStorage.setItem("coreot_tenant", JSON.stringify(data.tenant));
    setToken(data.access_token);
    setUser(data.user);
    setTenant(data.tenant);
    return data.user;
  }

  function logout() {
    localStorage.removeItem("coreot_token");
    localStorage.removeItem("coreot_user");
    localStorage.removeItem("coreot_tenant");
    setToken(null);
    setUser(null);
    setTenant(null);
  }

  return (
    <AuthContext.Provider value={{ user, tenant, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
