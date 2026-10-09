import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || "local";

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("id_token");
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  const tenant = localStorage.getItem("tenant_id") || "boc-tenant-01";
  config.headers["X-Tenant-Id"] = tenant;
  return config;
});

// 401 handler: only clear token if token is legitimately expired
client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401 && AUTH_MODE === "cognito") {
      const exp = Number(localStorage.getItem("id_token_exp") || "0");
      if (exp && exp <= Date.now()) {
        localStorage.removeItem("id_token");
        localStorage.removeItem("id_token_exp");
        window.location.reload();
      }
    }
    return Promise.reject(err);
  }
);

export const sendChat = (message, history) =>
  client.post("/chat", { message, history }).then((r) => r.data);

export const sendApproval = (execution_id, approved) =>
  client.post("/approve", { execution_id, approved }).then((r) => r.data);

export const getAudit = (execution_id) =>
  client.get(`/audit/${execution_id}`).then((r) => r.data);

export const listAudits = () =>
  client.get("/audit").then((r) => r.data);