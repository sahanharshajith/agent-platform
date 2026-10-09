// src/components/ApprovalPanel.jsx
import { useState } from "react";
import { sendApproval } from "../api/client";

export default function ApprovalPanel({ pending, onResolved }) {
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [viewJson, setViewJson] = useState(false);

  if (!pending) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center space-y-3 bg-slate-900/20">
        <div className="relative">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center shadow-inner">
            <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-2.48-5.836A9.015 9.015 0 0112 3c-1.39 0-2.704.316-3.876.88a9.01 9.01 0 00-4.608 4.608A9.013 9.013 0 003 12c0 1.39.316 2.704.88 3.876a9.01 9.01 0 004.608 4.608A9.013 9.013 0 0012 21c1.39 0 2.704-.316 3.876-.88a9.01 9.01 0 004.608-4.608A9.013 9.013 0 0021 12c0-1.39-.316-2.704-.88-3.876a9.01 9.01 0 00-4.608-4.608z" />
            </svg>
          </div>
          <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-slate-950 animate-pulse" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-200">Guardrail Active</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[240px]">
            No pending approvals. Actions exceeding safety limits will pause here for review.
          </p>
        </div>
      </div>
    );
  }

  const { execution_id, tenant_id, pending_action } = pending;
  const toolArgs = pending_action?.tool_args || {};

  const copyId = () => {
    navigator.clipboard?.writeText(execution_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const decide = async (approved) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await sendApproval(execution_id, approved);
      onResolved?.(res);
    } catch (e) {
      alert(`Approval error: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to format currency
  const isRefund = pending_action?.tool_name === "create_refund";

  return (
    <div className="p-5 space-y-4 h-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#334155_transparent] bg-slate-900/20">
      {/* Top Banner */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Action Intercepted
          </span>
        </div>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
          Human Review
        </span>
      </div>

      {/* Main Approval Card */}
      <div className="bg-slate-900/60 border border-amber-500/30 rounded-2xl p-4 space-y-4 shadow-[0_0_0_1px_rgba(245,158,11,0.15),0_12px_28px_-8px_rgba(217,119,6,0.25)] relative overflow-hidden backdrop-blur-sm">
        {/* Subtle top amber highlight beam */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

        {/* Execution & Tenant Metadata */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">ID</span>
            <span className="font-mono text-xs text-indigo-300 bg-indigo-950/40 border border-indigo-500/30 px-2 py-0.5 rounded truncate">
              {execution_id}
            </span>
            <button
              type="button"
              onClick={copyId}
              title="Copy Execution ID"
              className="text-slate-500 hover:text-slate-300 p-1 rounded hover:bg-slate-800/60 transition-colors"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                </svg>
              )}
            </button>
          </div>

          {(tenant_id || pending.tenant_id) && (
            <span className="text-[10px] font-mono text-slate-400 bg-slate-800/70 border border-slate-700/50 px-2 py-0.5 rounded">
              {tenant_id || pending.tenant_id}
            </span>
          )}
        </div>

        {/* Reason Alert Box */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex gap-2.5 items-start">
          <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Policy Trigger</p>
            <p className="text-xs text-amber-100 font-medium leading-relaxed">
              {pending_action?.reason || "High-risk tool call intercepted by guardrail policy."}
            </p>
          </div>
        </div>

        {/* Tool Requested & Parameters */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400">Tool Requested:</span>
              <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                {pending_action?.tool_name}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setViewJson(!viewJson)}
              className="text-[10px] text-slate-400 hover:text-slate-200 underline decoration-slate-700 hover:decoration-slate-400 transition-colors"
            >
              {viewJson ? "Formatted view" : "View JSON"}
            </button>
          </div>

          {/* Formatted View */}
          {!viewJson ? (
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
              {isRefund ? (
                <>
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Order ID</span>
                    <span className="font-mono text-slate-200 bg-slate-800 px-2 py-0.5 rounded font-medium">
                      {toolArgs.order_id || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pb-1.5 border-b border-slate-800/60">
                    <span className="text-slate-400">Refund Amount</span>
                    <span className="font-mono text-amber-300 font-bold text-sm bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded">
                      ${Number(toolArgs.amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs pt-0.5">
                    <span className="text-slate-400 block mb-1">Customer Reason</span>
                    <p className="text-slate-300 italic bg-slate-900/80 p-2 rounded border border-slate-800">
                      "{toolArgs.reason || "None specified"}"
                    </p>
                  </div>
                </>
              ) : (
                Object.entries(toolArgs).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs pb-1 border-b border-slate-800/40 last:border-0">
                    <span className="text-slate-400 font-medium">{k}</span>
                    <span className="font-mono text-slate-200">{String(v)}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <pre className="text-[11px] font-mono text-slate-300 bg-slate-950/80 border border-slate-800 rounded-xl p-3 overflow-x-auto leading-relaxed [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
              {JSON.stringify(toolArgs, null, 2)}
            </pre>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-1">
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={submitting}
            onClick={() => decide(true)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50
                       py-2.5 px-4 rounded-xl text-xs font-semibold text-white 
                       shadow-[0_4px_16px_-4px_rgba(16,185,129,0.4)] transition-all duration-200 
                       flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {submitting ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
            Approve & Execute
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => decide(false)}
            className="flex-1 bg-slate-800 hover:bg-rose-900/60 hover:border-rose-500/40 active:bg-rose-900 
                       disabled:opacity-50 py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-rose-200 
                       border border-slate-700/60 shadow-md transition-all duration-200 
                       flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Reject Request
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center">
          Decisions are permanently audited and trigger downstream workflows.
        </p>
      </div>
    </div>
  );
}