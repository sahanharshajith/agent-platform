import React, { useState } from "react";
import { Search, ChevronRight, Activity, ArrowUpDown } from "lucide-react";
import StatusBadge from "./StatusBadge";

export default function LiveActivityTable({ executions = [], onSelectExecution, loading }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = executions.filter((item) => {
    const matchesSearch =
      (item.execution_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.user_id || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.intent || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.model || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "completed" && item.status === "completed") ||
      (statusFilter === "pending" && (item.status === "pending_approval" || item.status.includes("pending"))) ||
      (statusFilter === "rejected" && item.status === "rejected");

    return matchesSearch && matchesStatus;
  });

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
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Execution ID, User, Intent, or Model..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending Approval</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table Card */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-900/60 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 min-w-[200px]">Intent</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4 text-right">Tokens</th>
                <th className="py-3 px-4">Execution ID</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No agent executions found matching criteria.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.execution_id}
                    onClick={() => onSelectExecution(item)}
                    className="hover:bg-indigo-50/40 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatTimestamp(item.timestamp)}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-900 dark:text-slate-200">
                      {item.user_id || "user_anon"}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium truncate max-w-xs sm:max-w-md">
                      {item.intent || "Agent query execution"}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium border border-slate-200/50 dark:border-white/5">
                        {item.model || "Claude 3.5 Sonnet"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap font-semibold">
                      {(item.tokens || 1120).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-indigo-600 dark:text-indigo-400 whitespace-nowrap font-medium">
                      {item.execution_id}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        className="p-1 rounded-lg text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/40 transition-colors"
                        title="Open Telemetry Drawer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
