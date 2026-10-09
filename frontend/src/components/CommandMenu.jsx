import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Search, ScrollText } from 'lucide-react';
import { useData } from '../context/DataContext';
import { executionMeta } from '../lib/format';
import { navigation } from '../lib/navigation';
import { Modal } from './Primitives';

export default function CommandMenu({ open, onClose }) {
  const [query, setQuery] = useState('');
  const { executions, details } = useData();
  const navigate = useNavigate();
  const results = useMemo(() => {
    const term = query.toLowerCase().trim();
    const pages = navigation.filter((item) => item.label.toLowerCase().includes(term)).map((item) => ({ ...item, description: 'Page' }));
    const records = term ? executions.filter((item) => `${item.execution_id} ${item.tenant_id} ${executionMeta(details[item.execution_id]).message}`.toLowerCase().includes(term)).slice(0, 6).map((item) => ({ path: `/audit?execution=${encodeURIComponent(item.execution_id)}`, label: item.execution_id, description: item.status.replaceAll('_', ' '), icon: ScrollText })) : [];
    return [...pages, ...records];
  }, [query, executions, details]);
  const go = (path) => { navigate(path); onClose(); setQuery(''); };
  return <Modal open={open} onClose={onClose} title="Search workspace" className="command-modal" hideHeader>
    <form className="command-input" onSubmit={(event) => { event.preventDefault(); if (results[0]) go(results[0].path); }}><Search size={20} /><input data-autofocus aria-label="Search pages, execution IDs, or messages" placeholder="Search pages, executions, or messages..." value={query} onChange={(event) => setQuery(event.target.value)} /><button className="keyboard-key" type="button" onClick={onClose}>esc</button></form>
    <div className="command-results"><span className="popover-label">{query ? 'SEARCH RESULTS' : 'QUICK NAVIGATION'}</span>{results.map(({ path, label, description, icon: Icon }) => <button key={path} className="command-result" onClick={() => go(path)}><Icon size={18} /><span><strong>{label}</strong><small>{description}</small></span><ArrowUpRight size={15} /></button>)}{!results.length && <p className="command-empty">No matches. Try an execution ID or a page name.</p>}</div>
    <div className="command-footer"><span>Search is scoped to your current tenant.</span><span><kbd>enter</kbd> to open</span></div>
  </Modal>;
}