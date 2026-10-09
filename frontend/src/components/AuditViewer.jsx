import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Braces, Check, ChevronDown, Copy, FileClock, LockKeyhole, MessageSquare, Search, ShieldCheck, Sparkles, UserCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { requestError } from '../api/client';
import { copyText, dateTime, number, relativeTime, time } from '../lib/format';
import { EmptyState, ErrorBanner, LoadingState } from './Primitives';
import StatusBadge from './StatusBadge';

const eventKinds = {
  user_message: { label: 'User message', icon: MessageSquare, color: 'purple' },
  tool_call: { label: 'Tool call', icon: Braces, color: 'blue' },
  policy: { label: 'Policy evaluation', icon: ShieldCheck, color: 'amber' },
  approval_decision: { label: 'End-user consent decision', icon: UserCheck, color: 'green' },
  final_response: { label: 'Final response', icon: Sparkles, color: 'green' },
};

export default function AuditViewer() {
  const { executions, details, loading, loadDetail, lastUpdated } = useData();
  const { notify } = useUI();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const [error, setError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [copied, setCopied] = useState(false);
  const status = params.get('status') || 'all';
  const filtered = useMemo(() => executions.filter((row) => `${row.execution_id} ${row.tenant_id}`.toLowerCase().includes(query.toLowerCase().trim()) && (status === 'all' || row.status === status)), [executions, query, status]);
  const selectedId = params.get('execution') || filtered[0]?.execution_id;
  const selected = executions.find((row) => row.execution_id === selectedId);
  const detail = details[selectedId];
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    setError('');
    setDetailLoading(true);
    setCopied(false);
    loadDetail(selectedId, true).catch((failure) => { if (active) setError(requestError(failure)); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selectedId, loadDetail, lastUpdated, retry]);
  const copy = async () => {
    try { await copyText(JSON.stringify(detail, null, 2)); setCopied(true); notify('Audit events copied as JSON.'); }
    catch (failure) { notify(failure.message, 'error'); }
  };
  return <div className="audit-layout">
    <section className="panel audit-list-panel"><div className="audit-list-heading"><h2>Executions <span>{number(filtered.length)}</span></h2><FileClock size={17} /></div><div className="audit-search"><div className="search-input"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30); }} aria-label="Search by execution or tenant ID" placeholder="Search execution or tenant ID" /></div><select className="audit-status-filter" aria-label="Filter audit status" value={status} onChange={(event) => { setParams(event.target.value === 'all' ? {} : { status: event.target.value }); setLimit(30); }}><option value="all">All statuses</option><option value="completed">Completed</option><option value="pending_approval">Pending user approval</option><option value="rejected">Rejected</option></select></div><div className="audit-execution-list">
      {loading ? <LoadingState /> : !filtered.length ? <EmptyState title="No matching executions" description="Try a different ID or status." /> : filtered.slice(0, limit).map((row) => <button key={row.execution_id} className={`audit-execution ${selectedId === row.execution_id ? 'selected' : ''}`} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('execution', row.execution_id); return next; })} aria-pressed={selectedId === row.execution_id}><div><code>{row.execution_id}</code><span>{relativeTime(row.timestamp)}</span></div><div><StatusBadge status={row.status} /><time dateTime={row.timestamp}>{time(row.timestamp)}</time></div></button>)}
      {filtered.length > limit && <button className="load-more-button" onClick={() => setLimit((value) => value + 30)}>Load more executions<ChevronDown size={14} /></button>}
    </div><div className="audit-list-footer"><span className="tiny-dot green" />Synced every 5 seconds</div></section>
    <section className="panel audit-timeline-panel">{!selectedId ? <EmptyState icon={FileClock} title="Every action tells a story" description="Select an execution to explore its complete event timeline." /> : <><div className="audit-detail-heading"><div><span className="eyebrow">EXECUTION TIMELINE</span><h2 className="mono">{selectedId}</h2><p>{selected ? dateTime(selected.timestamp) : 'Loading execution'}{selected && <StatusBadge status={selected.status} />}</p></div><button className="icon-button bordered" onClick={copy} disabled={!detail} aria-label="Copy audit events as JSON" title="Copy as JSON">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><div className="audit-readonly"><LockKeyhole size={14} /><span>An immutable record. Customer consent decisions are read-only.</span></div><ErrorBanner message={error} onRetry={() => setRetry((value) => value + 1)} />{detailLoading && !detail ? <LoadingState label="Loading event timeline..." /> : detail?.events?.length ? <ol className="event-timeline">{[...detail.events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).map((event, index) => {
      const kind = eventKinds[event.event_type] || { label: event.event_type, icon: FileClock, color: 'purple' };
      const Icon = kind.icon;
      return <li className={`timeline-event ${kind.color}`} key={`${selectedId}-${event.event_type}-${event.timestamp}-${index}`}>
        <div className="timeline-node"><Icon size={17} /></div>
        <div className="timeline-event-content">
          <div className="timeline-event-heading"><h3>{kind.label}</h3><time title={dateTime(event.timestamp)} dateTime={event.timestamp}>{time(event.timestamp)}</time></div>
          <span className="event-type mono">{event.event_type}</span>
          {event.event_type === 'approval_decision' && <p className="consent-readonly"><UserCheck size={14} />{typeof event.details?.message === 'string' ? event.details.message : 'This decision was made by the customer in their website chat. No admin action is available.'}</p>}
          <details className="json-details" open={index === 0 || event.event_type === 'final_response'}>
            <summary><Braces size={13} /><span>Event details</span><ChevronDown size={14} /></summary>
            <pre>{JSON.stringify(event.details, null, 2)}</pre>
          </details>
        </div>
      </li>;
    })}</ol> : !error && <EmptyState title="No events recorded" description="Events will appear here when the backend reports them." />}{detail && <div className="timeline-end"><Check size={13} /><span>{detail.events.length} events recorded<span className="muted"> / End of timeline</span></span></div>}</>}</section>
  </div>;
}