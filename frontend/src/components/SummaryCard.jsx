import React from "react";
import { motion } from "framer-motion";

export default function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendPositive = true,
  badge,
  badgeColor = "indigo",
  className = "",
}) {
  return (
    <motion.div
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className={`relative overflow-hidden rounded-2xl p-6 glass-panel transition-all shadow-sm hover:shadow-lg ${className}`}
    >
      {/* Background ambient radial glow */}
      <div className="absolute -top-12 -right-12 w-28 h-28 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {value}
            </h3>
            {badge && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-500 border border-amber-500/30">
                {badge}
              </span>
            )}
          </div>
        </div>

        {Icon && (
          <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/40 text-indigo-600 dark:text-indigo-400">
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-4 flex items-center text-xs text-slate-500 dark:text-slate-400">
          {trend && (
            <span
              className={`font-semibold mr-1.5 inline-flex items-center gap-0.5 ${
                trendPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {trendPositive ? "↑" : "↓"} {trend}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </motion.div>
  );
}
