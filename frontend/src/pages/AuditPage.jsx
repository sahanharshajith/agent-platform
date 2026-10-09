import React from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ScrollText, ShieldCheck } from "lucide-react";
import AuditViewer from "../components/AuditViewer";

export default function AuditPage() {
  const [searchParams] = useSearchParams();
  const initialExecutionId = searchParams.get("id");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Audit Trail & Event Timeline
          </h1>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            Immutable Ledger
          </span>
        </div>
        <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Forensic audit trail of all agent reasoning steps, tool payloads, and read-only customer approval decisions
        </p>
      </div>

      <AuditViewer initialExecutionId={initialExecutionId} />
    </motion.div>
  );
}
