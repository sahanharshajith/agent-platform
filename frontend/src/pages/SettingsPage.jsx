import React from "react";
import { motion } from "framer-motion";
import Settings from "../components/Settings";

export default function SettingsPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Tenant Settings & Integration
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Manage foundation model selection, policy guardrails, tenant API credentials, and web component deployment
        </p>
      </div>

      <Settings />
    </motion.div>
  );
}
