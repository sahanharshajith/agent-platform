import React from "react";
import { motion } from "framer-motion";
import TokenUsage from "../components/TokenUsage";

export default function UsagePage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Token Consumption & Spend Analytics
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Monitor foundation model usage, token quotas, and infrastructure budget across tenant agents
        </p>
      </div>

      <TokenUsage />
    </motion.div>
  );
}
