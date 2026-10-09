import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Activity,
  Layers,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getHealth } from "../api/client";

export default function Navbar({ onMobileMenuToggle, isMobileMenuOpen }) {
  const { userEmail, tenantId, logout, darkMode, toggleDarkMode } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState("checking");
  const dropdownRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const checkApiHealth = async () => {
      try {
        const res = await getHealth();
        if (mounted) {
          setHealthStatus(res.status === "ok" ? "healthy" : "degraded");
        }
      } catch (err) {
        if (mounted) setHealthStatus("degraded");
      }
    };

    checkApiHealth();
    const interval = setInterval(checkApiHealth, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Format tenant display name
  const tenantDisplay =
    tenantId === "boc-tenant-01"
      ? "Bank of Commerce"
      : tenantId || "Default Tenant";

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-white/10 glass-panel backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Left section: Logo & Mobile menu button */}
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onMobileMenuToggle}
              className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              aria-label="Toggle navigation"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>

            <Link to="/overview" className="flex items-center gap-2.5 group">
              <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-indigo-800 dark:from-white dark:via-indigo-200 dark:to-violet-300 bg-clip-text text-transparent">
                  AgentFlow
                </span>
                <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  Enterprise
                </span>
              </div>
            </Link>

            {/* Tenant badge */}
            <div className="hidden sm:flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-white/10">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Tenant:
              </span>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-200">
                  {tenantDisplay}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  ({tenantId})
                </span>
              </div>
            </div>
          </div>

          {/* Right section: System health, theme toggle, user avatar dropdown */}
          <div className="flex items-center gap-3">
            {/* System Status Indicator */}
            <div
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
              title="API Gateway Connectivity"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  healthStatus === "healthy"
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-500"
                }`}
              />
              <span className="text-slate-600 dark:text-slate-300">
                {healthStatus === "healthy" ? "Engine Active" : "Engine Standby"}
              </span>
            </div>

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle color theme"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-600" />
              )}
            </button>

            {/* User Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((prev) => !prev)}
                className="flex items-center gap-2 p-1.5 pl-2.5 rounded-xl border border-slate-200/80 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-sm">
                  {(userEmail || "Admin").charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-xs font-medium text-slate-900 dark:text-slate-200 truncate max-w-[120px]">
                    {userEmail || "Admin"}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500">
                    Administrator
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl glass-panel bg-white/95 dark:bg-slate-900/95 shadow-xl border border-slate-200 dark:border-white/10 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      {userEmail || "Admin User"}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      Tenant: {tenantId}
                    </p>
                    <span className="inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                      Read-Only Admin Console
                    </span>
                  </div>

                  <Link
                    to="/settings"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-indigo-500" />
                    <span>Console Settings</span>
                  </Link>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
