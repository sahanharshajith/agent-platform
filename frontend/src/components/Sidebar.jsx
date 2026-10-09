import React from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Activity,
  ScrollText,
  Cpu,
  Settings as SettingsIcon,
  Radio,
} from "lucide-react";

export default function Sidebar({ isOpen, onClose }) {
  const navItems = [
    {
      name: "Overview",
      to: "/overview",
      icon: LayoutDashboard,
    },
    {
      name: "Live Agent Activity",
      to: "/live-activity",
      icon: Activity,
      badge: "LIVE",
    },
    {
      name: "Audit Trail",
      to: "/audit",
      icon: ScrollText,
    },
    {
      name: "Token Usage",
      to: "/usage",
      icon: Cpu,
    },
    {
      name: "Settings",
      to: "/settings",
      icon: SettingsIcon,
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed md:sticky top-16 z-30 h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-slate-200/80 dark:border-white/10 glass-panel transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full justify-between p-4">
          <div className="space-y-6">
            <div className="px-3 pt-2">
              <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                Tenant Console
              </span>
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => {
                      if (onClose) onClose();
                    }}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-indigo-500/15 to-violet-500/10 text-indigo-600 dark:text-indigo-400 font-semibold shadow-sm shadow-indigo-500/5"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/40"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                            isActive
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                          }`}
                        />
                        <span className="flex-1 truncate">{item.name}</span>

                        {item.badge && (
                          <span className="flex items-center gap-1 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            {item.badge}
                          </span>
                        )}

                        {isActive && (
                          <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-indigo-600 to-violet-500" />
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Footer widget inside sidebar: Real-time sync badge */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/5 text-xs">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
              <Radio className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
              <span>Telemetry Feed</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Read-only admin stream polling every 5s.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
