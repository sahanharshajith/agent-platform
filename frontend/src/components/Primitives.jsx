import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, CircleAlert, LoaderCircle, RefreshCw, X } from 'lucide-react';

export function Modal({ open, onClose, title, children, className = '', hideHeader = false }) {
  const ref = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = setTimeout(() => ref.current?.querySelector('[data-autofocus], button, input, select, textarea, [href]')?.focus(), 50);
    const handleKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => { clearTimeout(timer); document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey); previousFocus?.focus?.(); };
  }, [open]);
  return createPortal(<AnimatePresence>{open && <div className={`modal-root ${className.includes('drawer') ? 'drawer-root' : ''}`}>
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
    <motion.section ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} initial={className.includes('drawer') ? { x: 36, opacity: 0 } : { y: 12, scale: 0.98, opacity: 0 }} animate={{ x: 0, y: 0, scale: 1, opacity: 1 }} exit={className.includes('drawer') ? { x: 36, opacity: 0 } : { y: 8, opacity: 0 }} transition={{ duration: 0.2 }}>
      <div className={hideHeader ? 'sr-only' : 'modal-header'}><h2 id={titleId}>{title}</h2>{!hideHeader && <button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>}</div>
      {children}
    </motion.section>
  </div>}</AnimatePresence>, document.body);
}

export function PageHeader({ title, description, children, eyebrow }) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{children && <div className="page-actions">{children}</div>}</div>;
}

export function EmptyState({ title = 'No executions yet', description = 'Activity will appear here when your agents start a conversation.', icon: Icon = Activity, action }) {
  return <div className="empty-state"><div className="empty-state-icon"><Icon size={24} strokeWidth={1.5} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{message}</span>{onRetry && <button className="text-button" onClick={onRetry}><RefreshCw size={14} />Try again</button>}</div>;
}

export function LoadingState({ label = 'Loading workspace activity...' }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}

export function SkeletonRows({ count = 5, columns = 4 }) {
  return <>{Array.from({ length: count }, (_, index) => <tr key={index} aria-hidden="true">{Array.from({ length: columns }, (_, column) => <td key={column}><span className="skeleton" style={{ width: `${65 + ((column * 7) % 25)}%` }} /></td>)}</tr>)}</>;
}