import { useState, useEffect } from "react";
import ChatWindow from "./components/ChatWindow";
import ApprovalPanel from "./components/ApprovalPanel";
import AuditViewer from "./components/AuditViewer";
import Login from "./components/Login";

const AUTH_MODE = import.meta.env.VITE_AUTH_MODE || "local";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [tenant, setTenant] = useState("boc-tenant-01");
  const [pending, setPending] = useState(null);
  const [lastExecution, setLastExecution] = useState(null);

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

  if (AUTH_MODE === "cognito" && !authenticated) {
    return <Login onLoggedIn={({ tenantId }) => {
      setTenant(tenantId || "boc-tenant-01");
      setAuthenticated(true);
    }} />;
  }

  const logout = () => {
    localStorage.removeItem("id_token");
    localStorage.removeItem("id_token_exp");
    setAuthenticated(false);
    window.location.reload();
  };

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="font-semibold">Agent Platform · MVP</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-400">Tenant:</span>
          <span className="text-slate-200 font-mono">{tenant}</span>
          {AUTH_MODE === "cognito" && (
            <button onClick={logout} className="text-xs bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded">
              Sign out
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-3 overflow-hidden">
        <div className="col-span-2 border-r border-slate-800 overflow-hidden">
          <ChatWindow
            onPendingApproval={setPending}
            onExecutionUpdate={(r) => setLastExecution(r.execution_id)}
          />
        </div>
        <div className="grid grid-rows-2 overflow-hidden">
          <div className="border-b border-slate-800 overflow-hidden">
            <ApprovalPanel pending={pending} onResolved={() => setPending(null)} />
          </div>
          <div className="overflow-hidden">
            <AuditViewer activeExecutionId={lastExecution} />
          </div>
        </div>
      </div>
    </div>
  );
}