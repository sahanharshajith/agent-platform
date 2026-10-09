import React, { useState, useEffect } from "react";
import {
  Search,
  MessageSquare,
  Wrench,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Bot,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Radio,
  FileJson,
  Layers,
  Info,
} from "lucide-react";
import StatusBadge from "./StatusBadge";
import { listAudits, getAudit } from "../api/client";

export default function AuditViewer({ initialExecutionId }) {
  const [executions, setExecutions] = useState([]);
  const [selectedExecId, setSelectedExecId] = useState(initialExecutionId || null);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState({ 0: true, 1: true });
  const [copiedId, setCopiedId] = useState(null);

  // Poll audit executions list every 5 seconds
  useEffect(() => {
    let isMounted = true;

    const fetchExecutions = async () => {
      try {
        const list = await listAudits();
        if (isMounted) {
          setExecutions(list);
          if (!selectedExecId && list.length > 0) {
            setSelectedExecId(list[0].execution_id);
          }
          setLoadingList(false);
        }
      } catch (err) {
        console.error("Error fetching audit list:", err);
        if (isMounted) setLoadingList(false);
      }
    };

    fetchExecutions();
    const interval = setInterval(fetchExecutions, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Sync initialExecutionId if prop changes
  useEffect(() => {
    if (initialExecutionId) {
      setSelectedExecId(initialExecutionId);
    }
  }, [initialExecutionId]);

  // Fetch execution events whenever selectedExecId changes or on poll
  useEffect(() => {
    if (!selectedExecId) return;
    let isMounted = true;

    const fetchDetail = async () => {
      setLoadingDetail(true);
      try {
        const detail = await getAudit(selectedExecId);
        if (isMounted) {
          setSelectedExecution(detail);
          setLoadingDetail(false);
        }
      } catch (err) {
        console.error("Error fetching execution detail:", err);
        if (isMounted) setLoadingDetail(false);
      }
    };

    fetchDetail();
    // Poll detail every 5s while looking at this execution
    const interval = setInterval(fetchDetail, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedExecId]);

  const filteredExecutions = executions.filter((ex) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (ex.execution_id || "").toLowerCase().includes(q) ||
      (ex.tenant_id || "").toLowerCase().includes(q)
    );
  });

  const toggleEventExpanded = (index) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getEventIcon = (eventType) => {
    switch (eventType) {
      case "user_message":
        return <MessageSquare className="w-4 h-4 text-sky-500" />;
      case "tool_call":
        return <Wrench className="w-4 h-4 text-amber-500" />;
      case "policy":
        return <ShieldCheck className="w-4 h-4 text-purple-500" />;
      case "approval_decision":
        return <Info className="w-4 h-4 text-emerald-500" />;
      case "final_response":
        return <Bot className="w-4 h-4 text-emerald-400" />;
      default:
        return <Layers className="w-4 h-4 text-indigo-400" />;
    }
  };

  const formatTimestamp = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch (e) {
      return ts;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: List of past executions */}
      <div className="lg:col-span-5 space-y-4">
        {/* Search Header */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Audit Logs ({filteredExecutions.length})
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span>Polling 5s</span>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by execution_id or tenant_id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>
        </div>

        {/* Executions Scrollable List */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-white/5 max-h-[calc(100vh-280px)] overflow-y-auto">
          {loadingList ? (
            <div className="p-8 text-center text-xs text-slate-400">Loading audit trail...</div>
          ) : filteredExecutions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              No executions matched your search.
            </div>
          ) : (
            filteredExecutions.map((item) => {
              const isSelected = item.execution_id === selectedExecId;
              return (
                <div
                  key={item.execution_id}
                  onClick={() => setSelectedExecId(item.execution_id)}
                  className={`p-3.5 transition-all cursor-pointer ${
                    isSelected
                      ? "bg-indigo-50/80 dark:bg-indigo-950/30 border-l-4 border-indigo-600 dark:border-indigo-500"
                      : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {item.execution_id}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(item.timestamp)}
                    </span>
                    <span>Tenant: {item.tenant_id}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right Column: Timeline of events for the selected execution */}
      <div className="lg:col-span-7 space-y-4">
        {selectedExecution ? (
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-6">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-white/10">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-mono text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    {selectedExecution.execution_id}
                  </h3>
                  <StatusBadge status={selectedExecution.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tenant: <span className="font-mono">{selectedExecution.tenant_id}</span> •{" "}
                  {selectedExecution.events?.length || 0} recorded events
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(selectedExecution, null, 2),
                    selectedExecution.execution_id
                  )
                }
                className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                {copiedId === selectedExecution.execution_id ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Copied JSON</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Audit</span>
                  </>
                )}
              </button>
            </div>

            {/* Timeline Events List */}
            <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {(selectedExecution.events || []).map((ev, idx) => {
                const isExpanded = expandedEvents[idx];
                const isApproval = ev.event_type === "approval_decision";

                return (
                  <div key={idx} className="relative group">
                    {/* Timeline Node Icon */}
                    <div className="absolute -left-6 sm:-left-8 top-1 w-6 h-6 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                      {getEventIcon(ev.event_type)}
                    </div>

                    <div className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 overflow-hidden shadow-xs">
                      {/* Event Row Header */}
                      <button
                        type="button"
                        onClick={() => toggleEventExpanded(idx)}
                        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-200 uppercase tracking-wide">
                            {ev.event_type}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                            {formatTimestamp(ev.timestamp)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {isApproval && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              READ-ONLY
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Informational Read-Only Banner if Approval Decision */}
                      {isApproval && (
                        <div className="px-3.5 py-2 bg-amber-500/10 border-t border-amber-500/20 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2 font-sans">
                          <Info className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Informational Entry: </span>
                            This event reflects end-user consent or interaction recorded on the website widget. The admin console does not execute approvals directly.
                          </div>
                        </div>
                      )}

                      {/* Collapsible Details JSON view */}
                      {isExpanded && (
                        <div className="p-3.5 border-t border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-slate-950/40 space-y-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <span className="flex items-center gap-1 font-mono uppercase text-[10px]">
                              <FileJson className="w-3.5 h-3.5 text-indigo-400" />
                              Payload Details
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  JSON.stringify(ev.details, null, 2),
                                  `ev-${idx}`
                                )
                              }
                              className="text-slate-400 hover:text-indigo-500 text-[10px] flex items-center gap-1"
                            >
                              {copiedId === `ev-${idx}` ? (
                                <Check className="w-3 h-3 text-emerald-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              Copy JSON
                            </button>
                          </div>

                          <pre className="p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto leading-relaxed border border-slate-800">
                            {JSON.stringify(ev.details || {}, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-12 text-center text-slate-400">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Select an execution from the left column to view its audit trail timeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}