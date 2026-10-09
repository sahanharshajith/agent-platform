import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('agentflow.theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
  });
  const [toast, setToast] = useState(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('agentflow.theme', theme); } catch { /* The current tab still supports theme changes. */ }
  }, [theme]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((message, type = 'success') => setToast({ message, type, id: Date.now() }), []);
  return <UIContext.Provider value={{ theme, setTheme, notify }}>
    {children}
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      <AnimatePresence>{toast && <motion.div key={toast.id} className={`toast ${toast.type}`} initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
        {toast.type === 'error' ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}<span>{toast.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button>
      </motion.div>}</AnimatePresence>
    </div>
  </UIContext.Provider>;
}

export const useUI = () => useContext(UIContext);