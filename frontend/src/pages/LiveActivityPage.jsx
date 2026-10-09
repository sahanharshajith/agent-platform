import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Radio, RefreshCw, Activity, ArrowUpRight } from "lucide-react";
import LiveActivityTable from "../components/LiveActivityTable";
import ActivityDrawer from "../components/ActivityDrawer";
import { listAudits, getAudit } from "../api/client";

export default function LiveActivityPage() {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(new Date());

  const fetchLiveActivity = async () => {
    try {
      const data = await listAudits();
      setExecutions(data);
      setLastPollTime(new Date());
    } catch (err) {
      console.error("Polling error in LiveActivityPage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveActivity();
    // Real-time polling every 5s
    const pollInterval = setInterval(fetchLiveActivity, 5000);
    return () => clearInterval(pollInterval);
  }, []);

  const handleSelectExecution = async (item) => {
    try {
      const detail = await getAudit(item.execution_id);
      setSelectedExecution(detail);
    } catch (err) {
      setSelectedExecution(item);
    }
    setIsDrawerOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header with real-time heartbeat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Live Agent Activity
            </h1>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
              <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>Real-time (5s poll)</span>
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Continuous stream of autonomous agent interactions, intent classifications, and policy gates
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <span>Synced: {lastPollTime.toLocaleTimeString()}</span>
          <button
            type="button"
            onClick={fetchLiveActivity}
            className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Force refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Main Table */}
      <LiveActivityTable
        executions={executions}
        onSelectExecution={handleSelectExecution}
        loading={loading}
      />

      {/* Detailed Side Drawer */}
      <ActivityDrawer
        execution={selectedExecution}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </motion.div>
  );
}
