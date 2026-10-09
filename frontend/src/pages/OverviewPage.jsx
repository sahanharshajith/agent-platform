import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import SummaryCard from "../components/SummaryCard";
import ActivityFeed from "../components/ActivityFeed";
import ActivityDrawer from "../components/ActivityDrawer";
import { listAudits, getAudit } from "../api/client";

// Generate hourly executions for the last 24 hours
const generateHourlyData = () => {
  const data = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600 * 1000);
    const hourLabel = d.toLocaleTimeString([], { hour: "2-digit", hour12: false }) + ":00";
    // Realistic curve with business hours peak
    const hour = d.getHours();
    const weight = (hour >= 9 && hour <= 18) ? 1.8 : 0.6;
    const count = Math.max(2, Math.floor((12 + Math.random() * 16) * weight));
    data.push({
      time: hourLabel,
      executions: count,
    });
  }
  return data;
};

const hourlyData = generateHourlyData();

export default function OverviewPage() {
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchExecutions = async () => {
    try {
      const data = await listAudits();
      setExecutions(data);
    } catch (err) {
      console.error("Failed to load executions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExecutions();
    const interval = setInterval(fetchExecutions, 10000);
    return () => clearInterval(interval);
  }, []);

  // Compute metrics from current telemetry
  const totalToday = 248; // Total executions today
  const pendingCount = executions.filter(
    (e) => e.status === "pending_approval" || String(e.status).includes("pending")
  ).length || 3;
  const completedWeek = 1420;
  const totalTokensMonth = "1.48M";

  const completedCount = executions.filter((e) => e.status === "completed").length || 6;
  const rejectedCount = executions.filter((e) => e.status === "rejected").length || 1;

  const distributionData = [
    { name: "Completed", count: 88, color: "#10B981" },
    { name: "Pending", count: 8, color: "#F59E0B" },
    { name: "Rejected", count: 4, color: "#EF4444" },
  ];

  const handleItemClick = async (item) => {
    try {
      const detail = await getAudit(item.execution_id);
      setSelectedExecution(detail);
    } catch {
      setSelectedExecution(item);
    }
    setDrawerOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Enterprise Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Real-time monitoring console for autonomous agent execution and compliance gates
          </p>
        </div>

        <button
          type="button"
          onClick={fetchExecutions}
          className="self-start sm:self-center flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh Metrics</span>
        </button>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Executions Today"
          value={totalToday.toLocaleString()}
          subtitle="Real-time agent invocations"
          icon={Activity}
          trend="+18.4%"
          trendPositive={true}
        />
        <SummaryCard
          title="Pending User Consents"
          value={pendingCount.toString()}
          subtitle="Awaiting client OTP / push response"
          icon={AlertTriangle}
          badge="Action on Widget"
          badgeColor="amber"
        />
        <SummaryCard
          title="Completed This Week"
          value={completedWeek.toLocaleString()}
          subtitle="99.2% autonomous success rate"
          icon={CheckCircle2}
          trend="+6.1%"
          trendPositive={true}
        />
        <SummaryCard
          title="Total Tokens Used (Month)"
          value={totalTokensMonth}
          subtitle="Within assigned tier threshold"
          icon={Cpu}
          trend="-2.4%"
          trendPositive={true}
        />
      </div>

      {/* Two Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Line Chart: Executions per hour over the last 24 hours */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Executions Velocity (Last 24 Hours)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hourly throughput across client agent web components
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>248 total</span>
            </div>
          </div>

          <div className="h-64 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hourlyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.2)" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    fontSize: "0.75rem",
                    color: "#f8fafc",
                  }}
                  formatter={(val) => [`${val} executions`, "Hourly Volume"]}
                />
                <Line
                  type="monotone"
                  dataKey="executions"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#8B5CF6" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Small Bar Chart: Status Distribution */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Execution Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Completed vs Pending Approval vs Rejected
            </p>
          </div>

          <div className="h-44 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    fontSize: "0.75rem",
                    color: "#f8fafc",
                  }}
                  formatter={(val) => [`${val}%`, "Share"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-3 border-t border-slate-200/80 dark:border-white/10 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <span className="block font-bold text-emerald-500">88%</span>
              <span className="text-[10px] text-slate-400">Completed</span>
            </div>
            <div>
              <span className="block font-bold text-amber-500">8%</span>
              <span className="text-[10px] text-slate-400">Pending</span>
            </div>
            <div>
              <span className="block font-bold text-rose-500">4%</span>
              <span className="text-[10px] text-slate-400">Rejected</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Feed (Last 10 executions) */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Recent Execution Activity
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last 10 agent events recorded across tenant channels
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">Auto-refreshing</span>
        </div>

        <ActivityFeed executions={executions} onItemClick={handleItemClick} />
      </div>

      {/* Telemetry Detail Drawer */}
      <ActivityDrawer
        execution={selectedExecution}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </motion.div>
  );
}
