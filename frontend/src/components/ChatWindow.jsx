// src/components/ChatWindow.jsx
import { useState, useEffect, useRef } from "react";
import { sendChat } from "../api/client";

export default function ChatWindow({ onPendingApproval, onExecutionUpdate, resolvedAction }) {
  // Preserve messages in sessionStorage across page refreshes until browser tab is closed
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem("chat_messages");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const messagesEndRef = useRef(null);

  // When an approval is resolved (approved or rejected), update the chat in real time
  useEffect(() => {
    if (!resolvedAction?.execution_id) return;
    setMessages((prev) => {
      // 1. Update the original pending message's status badge
      const updated = prev.map((m) => {
        if (m.meta?.execution_id === resolvedAction.execution_id && !m.meta?.after_approval) {
          return {
            ...m,
            meta: {
              ...m.meta,
              status: resolvedAction.status, // "completed" or "rejected"
            },
          };
        }
        return m;
      });

      // 2. Prevent duplicate follow-up message if already added
      const alreadyHasFollowup = prev.some(
        (m) => m.meta?.execution_id === resolvedAction.execution_id && m.meta?.after_approval
      );
      if (alreadyHasFollowup) return updated;

      // 3. Append the post-approval confirmation response from the agent
      const followupMsg = {
        role: "assistant",
        content:
          resolvedAction.response ||
          (resolvedAction.status === "completed"
            ? "Action approved and executed."
            : "Action rejected by reviewer."),
        meta: {
          ...resolvedAction,
          after_approval: true,
        },
      };

      return [...updated, followupMsg];
    });
  }, [resolvedAction]);

  // Sync messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      sessionStorage.setItem("chat_messages", JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save chat to sessionStorage:", e);
    }
  }, [messages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  // Warn user with popup modal before leaving or closing if active messages exist
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (messages.length > 0) {
        e.preventDefault();
        e.returnValue = "Are you sure you want to leave? Your conversation will only be kept until you close the browser.";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [messages]);

  const clearChat = () => {
    setMessages([]);
    sessionStorage.removeItem("chat_messages");
    setShowClearConfirm(false);
  };

  const send = async () => {
    if (!input.trim() || busy) return;
    const userMsg = { role: "user", content: input };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await sendChat(userMsg.content, history);
      setMessages((m) => [...m, { role: "assistant", content: res.response, meta: res }]);
      onExecutionUpdate?.(res);
      if (res.status === "pending_approval") {
        onPendingApproval?.(res);
      }
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Optional Chat Header Bar if messages exist */}
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-6 py-2 border-b border-slate-800/40 bg-slate-900/30 backdrop-blur-sm text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Active Session ({messages.length} message{messages.length === 1 ? "" : "s"})</span>
            <span className="text-[10px] text-slate-500">• Saved to session</span>
          </div>
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            Clear conversation
          </button>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 [scrollbar-width:thin] [scrollbar-color:#334155_transparent]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_8px_24px_-8px_rgba(79,70,229,0.25)]">
              <svg className="w-7 h-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">Start a conversation</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Ask about an order, request a refund, or ask a policy question. Your chats persist across page refreshes.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              {["What is your return policy?", "Status of ORD-1001", "Refund $220 for ORD-1003"].map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 px-2.5 py-1.5 rounded-lg transition-all duration-150"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-md shadow-indigo-900/30"
                  : "bg-slate-800/80 text-slate-200 border border-slate-700/40 rounded-bl-md"
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>
              {m.meta?.execution_id && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
                  <span className="text-[10px] font-mono text-slate-400/80 bg-black/20 px-1.5 py-0.5 rounded">
                    exec: {m.meta.execution_id}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                    m.meta.status === "pending_approval"
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                      : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                  }`}>
                    {m.meta.status}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="bg-slate-800/80 border border-slate-700/40 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-slate-800/60 bg-slate-900/40 backdrop-blur-sm p-4 shrink-0">
        <div className="flex gap-2.5 max-w-4xl mx-auto">
          <input
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask about an order, request a refund, or ask a policy question..."
            disabled={busy}
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-3 rounded-xl text-sm font-medium text-white shadow-lg shadow-indigo-900/30 transition-all duration-200 flex items-center gap-2"
          >
            {busy ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
            Send
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Clearing Conversation */}
      {showClearConfirm && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl shadow-black/80">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Clear Conversation?</h3>
                <p className="text-xs text-slate-500">Action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete all messages in this session? Your conversation will be removed immediately.
            </p>
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-xl text-xs font-medium text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearChat}
                className="flex-1 bg-rose-600 hover:bg-rose-500 py-2 rounded-xl text-xs font-semibold text-white shadow-lg shadow-rose-900/40 transition-colors"
              >
                Yes, Clear Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}