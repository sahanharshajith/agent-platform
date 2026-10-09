import { useState, useEffect } from "react";
import ChatWindow from "./components/ChatWindow";
import ApprovalPanel from "./components/ApprovalPanel";
import AuditViewer from "./components/AuditViewer";
import Login from "./components/Login";

const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || "local";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tenant, setTenant] = useState("boc-tenant-01");
  const [pending, setPending] = useState(() => {
    try {
      const saved = sessionStorage.getItem("pending_approval");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [lastExecution, setLastExecution] = useState(() => {
    try {
      return sessionStorage.getItem("last_execution") || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (AUTH_MODE === "cognito") {
      const token = localStorage.getItem("id_token");
      const exp = Number(localStorage.getItem("id_token_exp") || "0");
      if (token && exp > Date.now()) {
        setAuthenticated(true);
        setTenant(localStorage.getItem("tenant_id") || "boc-tenant-01");
      } else {
        localStorage.removeItem("id_token");
      }
    } else {
      setAuthenticated(true);
      setTenant(localStorage.getItem("tenant_id") || "tenantA");
    }
  }, []);

  const updatePending = (val) => {
    setPending(val);
    try {
      if (val) {
        sessionStorage.setItem("pending_approval", JSON.stringify(val));
      } else {
        sessionStorage.removeItem("pending_approval");
      }
    } catch (e) {
      console.error("Failed to save pending approval:", e);
    }
  };

  const updateLastExecution = (val) => {
    setLastExecution(val);
    try {
      if (val) {
        sessionStorage.setItem("last_execution", val);
      } else {
        sessionStorage.removeItem("last_execution");
      }
    } catch (e) {
      console.error("Failed to save last execution:", e);
    }
  };

  if (AUTH_MODE === "cognito" && !authenticated) {
    return (
      <Login
        onLoggedIn={({ tenantId }) => {
          setTenant(tenantId || "boc-tenant-01");
          setAuthenticated(true);
        }}
      />
    );
  }

  const logout = () => {
    localStorage.removeItem("id_token");
    localStorage.removeItem("id_token_exp");
    sessionStorage.clear();
    setAuthenticated(false);
    window.location.reload();
  };

  const [resolvedAction, setResolvedAction] = useState(null);

  const handleApprovalResolved = (res) => {
    updatePending(null);
    if (res?.execution_id) {
      updateLastExecution(res.execution_id);
    }
    setResolvedAction(res);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-sm px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight">Agent Platform</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Multi-tenant MVP</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">Tenant</span>
            <span className="text-xs font-mono text-slate-200">{tenant}</span>
          </div>
          {AUTH_MODE === "cognito" && (
            <button
              type="button"
              onClick={logout}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/40 px-3 py-1.5 rounded-lg transition-all duration-150"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Main grid */}
      <div className="flex-1 grid grid-cols-3 overflow-hidden">
        <div className="col-span-2 border-r border-slate-800/60 overflow-hidden">
          <ChatWindow
            onPendingApproval={updatePending}
            onExecutionUpdate={(r) => updateLastExecution(r.execution_id)}
            resolvedAction={resolvedAction}
          />
        </div>
        <div className="grid grid-rows-2 overflow-hidden">
          <div className="border-b border-slate-800/60 overflow-hidden">
            <ApprovalPanel pending={pending} onResolved={handleApprovalResolved} />
          </div>
          <div className="overflow-hidden">
            <AuditViewer activeExecutionId={lastExecution} />
          </div>
        </div>
      </div>
    </div>
  );
}