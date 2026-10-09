// src/components/AuditViewer.jsx
import { useState } from "react";
import { getAudit, listAudits } from "../api/client";

export default function AuditViewer({ activeExecutionId }) {
  const [events, setEvents] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadExecutions = async () => {
    setLoading(true);
    try {
      const res = await listAudits();
      setExecutions(res.executions || []);
    } finally {
      setLoading(false);
    }
  };

  const loadOne = async (execution_id) => {
    setLoading(true);
    try {
      const res = await getAudit(execution_id);
      setEvents(res.events || []);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#334155_transparent] bg-slate-900/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-200 tracking-tight">Audit Trail</span>
        </div>
        <button
          onClick={loadExecutions}
          disabled={loading}
          className="text-xs font-medium text-slate-400 hover:text-slate-200 
                     bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/40 
                     px-3 py-1.5 rounded-lg transition-all duration-200 
                     disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {/* Executions list */}
      {executions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider px-1">Executions</p>
          {executions.map((e) => {
            const isActive = e.execution_id === activeExecutionId;
            return (
              <button
                key={e.execution_id}
                onClick={() => loadOne(e.execution_id)}
                className={`w-full text-left text-xs px-3 py-2 rounded-lg transition-all duration-150 
                  flex items-center justify-between group ${
                  isActive
                    ? "bg-indigo-500/15 border border-indigo-500/30 text-indigo-300"
                    : "bg-slate-800/50 hover:bg-slate-800 border border-transparent hover:border-slate-700/40 text-slate-300"
                }`}
              >
                <span className="font-mono truncate">{e.execution_id}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ml-2 ${
                  e.status === "pending_approval"
                    ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                    : e.status === "completed"
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                    : "bg-slate-700/50 text-slate-400 border border-slate-600/30"
                }`}>
                  {e.status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Events list */}
      {events.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider px-1">Events</p>
          {events.map((ev, i) => (
            <div
              key={i}
              className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 text-xs hover:border-indigo-500/30 transition-colors duration-150"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[11px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                  {ev.event_type}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <pre className="text-[10px] font-mono text-slate-400 bg-slate-900/60 rounded-lg p-2.5 overflow-x-auto leading-relaxed border border-slate-800/60">
                {JSON.stringify(ev.payload, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!executions.length && !events.length && (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-slate-800/50 border border-slate-700/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-400">No audit history</p>
            <p className="text-xs text-slate-600 mt-1">Click refresh to load executions.</p>
          </div>
        </div>
      )}
    </div>
  );
}