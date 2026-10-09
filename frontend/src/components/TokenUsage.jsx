import React from "react";
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
import { Cpu, DollarSign, Wallet, Users, Zap } from "lucide-react";
import SummaryCard from "./SummaryCard";

// Generate 30 days of token trend data
const generateMonthlyTokenTrend = () => {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dayStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    // Realistic curve with weekday peaks
    const base = 35000 + Math.sin(i / 3) * 12000;
    const randomVariation = Math.floor(Math.random() * 8000);
    const total = Math.floor(base + randomVariation);
    data.push({
      date: dayStr,
      tokens: total,
      sonnet: Math.floor(total * 0.65),
      haiku: Math.floor(total * 0.28),
      embeddings: Math.floor(total * 0.07),
    });
  }
  return data;
};

const monthlyData = generateMonthlyTokenTrend();

const modelSpendData = [
  { model: "Claude 3.5 Sonnet", tokens: 963885, cost: 22.15, color: "#6366F1" },
  { model: "Claude 3 Haiku", tokens: 415215, cost: 4.82, color: "#8B5CF6" },
  { model: "Titan Embeddings v2", tokens: 103800, cost: 1.48, color: "#38BDF8" },
];

const recentExecutionsUsage = [
  { id: "exec-9941a87b", timestamp: "18:31:12", model: "Claude 3.5 Sonnet", input: 890, output: 530, total: 1420, cost: "$0.021" },
  { id: "exec-8720b12c", timestamp: "18:28:44", model: "Claude 3 Haiku", input: 420, output: 260, total: 680, cost: "$0.003" },
  { id: "exec-7619c34d", timestamp: "18:24:15", model: "Claude 3.5 Sonnet", input: 1450, output: 680, total: 2130, cost: "$0.034" },
  { id: "exec-6508d56e", timestamp: "18:18:02", model: "Claude 3 Haiku", input: 390, output: 130, total: 520, cost: "$0.002" },
  { id: "exec-5497e78f", timestamp: "18:10:49", model: "Titan Embeddings", input: 410, output: 0, total: 410, cost: "$0.0004" },
  { id: "exec-4386f90a", timestamp: "18:02:30", model: "Claude 3.5 Sonnet", input: 1120, output: 770, total: 1890, cost: "$0.029" },
  { id: "exec-3275a12b", timestamp: "17:49:11", model: "Claude 3.5 Sonnet", input: 980, output: 670, total: 1650, cost: "$0.025" },
];

export default function TokenUsage() {
  return (
    <div className="space-y-8">
      {/* 4 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Tokens Used (MTD)"
          value="1,482,900"
          subtitle="Across all deployed agents"
          icon={Cpu}
          trend="+14.2%"
          trendPositive={true}
        />
        <SummaryCard
          title="Remaining Budget"
          value="3,517,100"
          subtitle="70.3% of 5.0M allocation remaining"
          icon={Wallet}
          badge="Healthy"
        />
        <SummaryCard
          title="Cost Estimate (MTD)"
          value="$28.45"
          subtitle="Projected $42.10 by month end"
          icon={DollarSign}
          trend="-3.1%"
          trendPositive={true}
        />
        <SummaryCard
          title="Active Sessions"
          value="18"
          subtitle="Real-time end-user conversations"
          icon={Users}
          trend="+4"
          trendPositive={true}
        />
      </div>

      {/* Two Column Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Line Chart: Daily Token Usage over last 30 days */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Daily Token Consumption (Last 30 Days)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Aggregate daily input and completion tokens across tenant endpoints
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              <span className="text-slate-500 dark:text-slate-400">Tokens / Day</span>
            </div>
          </div>

          <div className="h-72 w-full pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(148, 163, 184, 0.2)" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    fontSize: "0.75rem",
                    color: "#f8fafc",
                  }}
                  formatter={(val) => [`${val.toLocaleString()} tokens`, "Usage"]}
                />
                <Line
                  type="monotone"
                  dataKey="tokens"
                  stroke="#6366F1"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: "#8B5CF6" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar Chart: Token Spend Per Model */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Spend by Foundation Model
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Breakdown of token consumption & charges
            </p>
          </div>

          <div className="h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={modelSpendData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.15)" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="model"
                  type="category"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    fontSize: "0.75rem",
                    color: "#f8fafc",
                  }}
                  formatter={(val, name, item) => [
                    `${val.toLocaleString()} tokens ($${item.payload.cost})`,
                    "Consumption",
                  ]}
                />
                <Bar dataKey="tokens" radius={[0, 6, 6, 0]}>
                  {modelSpendData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="pt-2 border-t border-slate-200/80 dark:border-white/10 space-y-2">
            {modelSpendData.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600 dark:text-slate-300 font-medium">{item.model}</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    ${item.cost.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table: Recent Executions with Tokens Used */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel overflow-hidden shadow-sm space-y-4 p-6">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
            Recent Executions Token Ledger
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Per-execution token metering and cost breakdown
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-slate-900/60 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Execution ID</th>
                <th className="py-3 px-4">Time</th>
                <th className="py-3 px-4">Model</th>
                <th className="py-3 px-4 text-right">Input Tokens</th>
                <th className="py-3 px-4 text-right">Output Tokens</th>
                <th className="py-3 px-4 text-right">Total Tokens</th>
                <th className="py-3 px-4 text-right">Estimated Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5 font-mono">
              {recentExecutionsUsage.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-semibold text-indigo-600 dark:text-indigo-400">
                    {row.id}
                  </td>
                  <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-sans">
                    {row.timestamp}
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-sans">
                    {row.model}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">
                    {row.input.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-slate-600 dark:text-slate-400">
                    {row.output.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                    {row.total.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-bold">
                    {row.cost}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
