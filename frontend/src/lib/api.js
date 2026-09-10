import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BASE}/api`;

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("coreot_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !window.location.pathname.startsWith("/login")) {
      localStorage.removeItem("coreot_token");
      localStorage.removeItem("coreot_user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function buildWsUrl(token) {
  const httpBase = process.env.REACT_APP_BACKEND_URL || "";
  const wsBase = httpBase.replace(/^http/, "ws");
  return `${wsBase}/api/ws/telemetry?token=${encodeURIComponent(token)}`;
}
