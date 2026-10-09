import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  User,
  Brain,
  Wrench,
  ShieldAlert,
  Database,
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function ActivityDrawer({ execution, isOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [openTools, setOpenTools] = useState({ 0: true });

  if (!isOpen || !execution) return null;

  // Extract or synthesize structured telemetry from events or properties
  const events = execution.events || [];

  const userEvent = events.find((e) => e.event_type === "user_message");
  const userMessage =
    userEvent?.details?.message ||
    execution.intent ||
    "Please initiate an emergency supplier wire transfer of $4,500.00 to Apex Logistical Services.";

  const ragEvent = events.find((e) => e.event_type === "rag_retrieval");
  const ragSources = ragEvent?.details?.sources || [
    {
      doc_id: "policy_banking_v4.pdf",
      title: "Commercial Wire Transfer Guidelines",
      chunk_text:
        "Transfers over $2,500.00 require secondary customer approval and compliance sanction screening.",
      score: 0.94,
    },
    {
      doc_id: "approved_vendors_2026.csv",
      title: "Verified Vendor Register",
      chunk_text:
        "Apex Logistical Services (Routing: 021000021, Account: ****9812) is flagged as Tier 2 Supplier.",
      score: 0.88,
    },
  ];

  const toolEvents = events.filter((e) => e.event_type === "tool_call");
  const defaultTools = [
    {
      details: {
        tool_name: "check_account_balance_and_limits",
        arguments: {
          account_id: "acct_prime_9901",
          currency: "USD",
          requested_amount: 4500.0,
        },
        result: {
          sufficient_funds: true,
          available_balance: 48920.5,
          daily_limit_remaining: 15000.0,
        },
      },
    },
  ];
  const toolCalls = toolEvents.length > 0 ? toolEvents : defaultTools;

  const policyEvent = events.find((e) => e.event_type === "policy");
  const policyDecision = policyEvent?.details || {
    rule_evaluated: "wire_amount_threshold_gate",
    threshold_amount: 2500.0,
    transaction_amount: 4500.0,
    policy_decision:
      execution.status === "rejected"
        ? "BLOCK_VIOLATION"
        : execution.status === "pending_approval"
        ? "REQUIRE_END_USER_CONSENT"
        : "AUTO_ALLOW",
    risk_score: 0.18,
  };

  const responseEvent = events.find((e) => e.event_type === "final_response");
  const finalResponse =
    responseEvent?.details?.response_text ||
    (execution.status === "pending_approval"
      ? "Action paused: An authorization push notification has been sent to the customer device for biometric consent."
      : execution.status === "rejected"
      ? "I am unable to proceed with this request because it exceeds organizational safety policy limits."
      : "Your request has been processed successfully. Transaction reference WT-881920.");

  const modelReasoning =
    "Classified query as financial transaction execution. Verified user balance against core ledger. Enforced Policy Gate #4: Transactions over $2,500 require customer explicit multi-factor verification.";

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleTool = (idx) => {
    setOpenTools((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        />

        <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="w-screen max-w-2xl bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-white/10 shadow-2xl flex flex-col h-full"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/30">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="text-xs font-mono font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                    {execution.execution_id}
                  </span>
                  <StatusBadge status={execution.status} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Execution Telemetry • Tenant:{" "}
                  <span className="font-mono">{execution.tenant_id}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(execution, null, 2))}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Copy Raw JSON"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 1. Full User Message */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <User className="w-4 h-4 text-indigo-500" />
                  <span>Full User Message</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 leading-relaxed font-sans shadow-sm">
                  "{userMessage}"
                </div>
              </div>

              {/* 2. Model Reasoning Summary */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <Brain className="w-4 h-4 text-violet-500" />
                  <span>Model Reasoning Summary</span>
                </div>
                <div className="p-4 rounded-xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 text-xs text-slate-700 dark:text-indigo-200 leading-relaxed font-sans">
                  {modelReasoning}
                </div>
              </div>

              {/* 3. RAG Chunks Retrieved */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-sky-500" />
                    <span>RAG Chunks Retrieved ({ragSources.length})</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">Embedding: Titan v2</span>
                </div>
                <div className="space-y-2.5">
                  {ragSources.map((chunk, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-semibold text-slate-900 dark:text-slate-200 truncate max-w-xs">
                          {chunk.title}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 border border-sky-500/20">
                          Relevance: {(chunk.score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 italic">
                        "{chunk.chunk_text}"
                      </p>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        Source: {chunk.doc_id}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. Tool Calls Made */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <span>Tool Calls Made ({toolCalls.length})</span>
                </div>
                <div className="space-y-2">
                  {toolCalls.map((tc, idx) => {
                    const tool = tc.details || tc;
                    const isOpenTool = openTools[idx];
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-slate-200 dark:border-slate-700/80 overflow-hidden bg-slate-50/60 dark:bg-slate-800/30"
                      >
                        <button
                          type="button"
                          onClick={() => toggleTool(idx)}
                          className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <div className="flex items-center gap-2 font-mono text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                            <span>{tool.tool_name || "execute_transaction"}</span>
                          </div>
                          {isOpenTool ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        {isOpenTool && (
                          <div className="p-3 border-t border-slate-200 dark:border-slate-700/60 space-y-2">
                            <div>
                              <span className="text-[10px] uppercase font-bold text-slate-400">
                                Arguments
                              </span>
                              <pre className="mt-1 p-2 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto">
                                {JSON.stringify(tool.arguments || {}, null, 2)}
                              </pre>
                            </div>
                            {tool.result && (
                              <div>
                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                  Return Value
                                </span>
                                <pre className="mt-1 p-2 rounded-lg bg-slate-900 text-emerald-300 font-mono text-[11px] overflow-x-auto">
                                  {JSON.stringify(tool.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 5. Policy Decision */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4 text-emerald-500" />
                  <span>Policy Gate Decision</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Policy Rule:</span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-200">
                      {policyDecision.rule_evaluated || "amount_threshold_check"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Threshold / Amount:</span>
                    <span className="font-mono text-slate-900 dark:text-slate-200">
                      ${policyDecision.threshold_amount} / ${policyDecision.transaction_amount}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700/60">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Verdict:</span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {policyDecision.policy_decision}
                    </span>
                  </div>
                </div>
              </div>

              {/* 6. Final Response */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-indigo-500" />
                    <span>Agent Final Response</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    Model: {execution.model || "Claude 3.5 Sonnet"}
                  </span>
                </div>
                <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900/40 text-sm text-slate-900 dark:text-slate-100 shadow-sm leading-relaxed">
                  {finalResponse}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-950 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Read-only audit record</span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 font-medium transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
