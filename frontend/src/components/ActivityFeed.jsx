import React from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, MessageSquare, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";

export default function ActivityFeed({ executions = [], onItemClick }) {
  const recentItems = executions.slice(0, 10);

  if (recentItems.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 dark:text-slate-400">
        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No recent execution events recorded.</p>
      </div>
    );
  }

  const formatTime = (ts) => {
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch (e) {
      return ts;
    }
  };

  return (
    <div className="divide-y divide-slate-100 dark:divide-white/5">
      {recentItems.map((item, index) => {
        const userMsg =
          item.intent ||
          item.user_message ||
          item.message ||
          "Customer requested autonomous agent action";

        return (
          <motion.div
            key={item.execution_id || index}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.04 }}
            className="py-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 rounded-xl transition-colors group cursor-pointer"
            onClick={() => onItemClick && onItemClick(item)}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="mt-1 w-2 h-2 rounded-full bg-indigo-500/70 group-hover:bg-indigo-500 transition-colors shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-200">
                    {item.execution_id}
                  </span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 truncate max-w-md sm:max-w-xl">
                  {userMsg}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <div className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                <Clock className="w-3 h-3" />
                <span>{formatTime(item.timestamp)}</span>
              </div>

              <Link
                to={`/audit?id=${item.execution_id}`}
                onClick={(e) => e.stopPropagation()}
                className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                title="View in Audit Trail"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
