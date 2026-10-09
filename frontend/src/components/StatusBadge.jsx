import React from "react";

/**
 * StatusBadge Component
 * Displays exact status values:
 * - "completed" -> Green
 * - "pending_approval" / "pending user approval" -> Amber with subtle pulse
 * - "rejected" -> Red
 */
export default function StatusBadge({ status, className = "" }) {
  const normStatus = String(status || "").toLowerCase().trim();

  if (normStatus === "completed" || normStatus === "complete") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        <span>completed</span>
      </span>
    );
  }

  if (
    normStatus === "pending_approval" ||
    normStatus === "pending" ||
    normStatus.includes("pending")
  ) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <span>pending user approval</span>
      </span>
    );
  }

  if (normStatus === "rejected" || normStatus === "failed" || normStatus === "blocked") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
        <span>rejected</span>
      </span>
    );
  }

  // Fallback neutral
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20 ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
      <span>{normStatus || "unknown"}</span>
    </span>
  );
}
