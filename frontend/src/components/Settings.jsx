import React, { useState } from "react";
import {
  Building2,
  Cpu,
  ShieldAlert,
  Key,
  Code,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Settings() {
  const { tenantId } = useAuth();

  // Model configuration state
  const [classificationModel, setClassificationModel] = useState("claude-3-haiku");
  const [reasoningModel, setReasoningModel] = useState("claude-3-5-sonnet");
  const [embeddingModel, setEmbeddingModel] = useState("titan-embed-v2");

  // Policy threshold state
  const [refundThreshold, setRefundThreshold] = useState("50.00");
  const [wireThreshold, setWireThreshold] = useState("2500.00");
  const [maxSteps, setMaxSteps] = useState("5");

  // API Key state
  const [apiKey, setApiKey] = useState("af_live_99a8f4c2810941e421b8c6a");
  const [showApiKey, setShowApiKey] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);

  // Copy feedback states
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const tenantName =
    tenantId === "boc-tenant-01" ? "Bank of Commerce" : "Enterprise Client";
  const tenantDomain =
    tenantId === "boc-tenant-01"
      ? "portal.bankofcommerce.example"
      : `${tenantId}.agentflow.app`;

  const embedSnippet = `<!-- AgentFlow Autonomous AI Agent Widget -->
<script
  src="https://cdn.agentflow.ai/v1/widget.js"
  data-tenant-id="${tenantId || "boc-tenant-01"}"
  data-theme="auto"
  async>
</script>`;

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleRotateKey = () => {
    if (
      window.confirm(
        "Are you sure you want to rotate your tenant API key? Any active widget instances using the old key will need to be reloaded."
      )
    ) {
      setRotatingKey(true);
      setTimeout(() => {
        const randomPart = Math.random().toString(36).substring(2, 15);
        setApiKey(`af_live_${randomPart}${Date.now().toString(36)}`);
        setRotatingKey(false);
        alert("API Key successfully rotated!");
      }, 600);
    }
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setSaveStatus("saving");
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 3000);
    }, 400);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* 1. Tenant Profile (Read-Only) */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200/80 dark:border-white/10">
          <Building2 className="w-5 h-5 text-indigo-500" />
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Tenant Profile
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Read-only enterprise organization metadata
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Organization Name
            </label>
            <input
              type="text"
              readOnly
              value={tenantName}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-not-allowed font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Tenant Domain
            </label>
            <input
              type="text"
              readOnly
              value={tenantDomain}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 cursor-not-allowed font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
              Tenant ID
            </label>
            <input
              type="text"
              readOnly
              value={tenantId || "boc-tenant-01"}
              className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 cursor-not-allowed font-mono font-bold"
            />
          </div>
        </div>
      </div>

      {/* 2. Model Configuration */}
      <form onSubmit={handleSaveSettings} className="space-y-8">
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200/80 dark:border-white/10">
            <Cpu className="w-5 h-5 text-violet-500" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Model Configuration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure foundation models for user intent classification, reasoning, and vector embeddings
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Classification Model
              </label>
              <select
                value={classificationModel}
                onChange={(e) => setClassificationModel(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="claude-3-haiku">Claude 3 Haiku (Fast & Low Cost)</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Balanced)</option>
                <option value="titan-express">Amazon Titan Text Express</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Reasoning / Execution Model
              </label>
              <select
                value={reasoningModel}
                onChange={(e) => setReasoningModel(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet (Recommended)</option>
                <option value="claude-3-opus">Claude 3 Opus (High Intelligence)</option>
                <option value="titan-premier">Amazon Titan Text Premier</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Embedding Model
              </label>
              <select
                value={embeddingModel}
                onChange={(e) => setEmbeddingModel(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="titan-embed-v2">Amazon Titan Embeddings v2</option>
                <option value="cohere-embed">Cohere Embed Multilingual v3</option>
              </select>
            </div>
          </div>
        </div>

        {/* 3. Policy Thresholds */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200/80 dark:border-white/10">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Policy Thresholds & Human-in-the-Loop Safeguards
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Actions exceeding these thresholds will require mandatory end-user consent
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Refund approval threshold ($)
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={refundThreshold}
                  onChange={(e) => setRefundThreshold(e.target.value)}
                  className="w-full pl-7 pr-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Refunds over this amount prompt customer authorization.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Wire transfer gate limit ($)
              </label>
              <div className="relative mt-1.5">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">
                  $
                </span>
                <input
                  type="number"
                  step="100.00"
                  min="0"
                  value={wireThreshold}
                  onChange={(e) => setWireThreshold(e.target.value)}
                  className="w-full pl-7 pr-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Wire transfers exceeding this require secondary OTP verification.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Max Autonomous Agent Steps
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={maxSteps}
                onChange={(e) => setMaxSteps(e.target.value)}
                className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Safety loop ceiling before halting reasoning.
              </p>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500 transition-all shadow-md shadow-indigo-500/20"
            >
              {saveStatus === "saved" ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-300" />
                  <span>Configuration Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Policy & Models</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* 4. API Keys Section */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200/80 dark:border-white/10">
          <Key className="w-5 h-5 text-indigo-500" />
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Tenant API Key
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Used by backend services and website chatbot widgets to authenticate agent requests
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
          <div className="relative flex-1">
            <input
              type={showApiKey ? "text" : "password"}
              readOnly
              value={apiKey}
              className="w-full pl-3.5 pr-20 py-2.5 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white font-mono"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowApiKey((prev) => !prev)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title={showApiKey ? "Hide key" : "Show key"}
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={handleCopyKey}
                className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                title="Copy API key"
              >
                {copiedKey ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRotateKey}
            disabled={rotatingKey}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotatingKey ? "animate-spin" : ""}`} />
            <span>Rotate Key</span>
          </button>
        </div>
      </div>

      {/* 5. Embed Snippet Section */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 glass-panel p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/10">
          <div className="flex items-center gap-2.5">
            <Code className="w-5 h-5 text-sky-500" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Website Embed Snippet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Copy and paste this script before the closing &lt;/body&gt; tag on your website
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCopySnippet}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/40 hover:bg-indigo-100 transition-colors"
          >
            {copiedSnippet ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span>Copied Snippet</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy HTML</span>
              </>
            )}
          </button>
        </div>

        <div className="relative rounded-xl bg-slate-900 border border-slate-800 p-4 font-mono text-xs overflow-x-auto text-emerald-300">
          <pre>{embedSnippet}</pre>
        </div>
      </div>
    </div>
  );
}
