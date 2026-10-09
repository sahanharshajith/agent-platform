import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useData, useExecutionDetails } from '../context/DataContext';
import { dateTime, executionMeta, number, time } from '../lib/format';
import { EmptyState, SkeletonRows } from './Primitives';
import StatusBadge from './StatusBadge';

export default function LiveActivityTable({ onSelect }) {
  const { executions, loading, paused } = useData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const status = params.get('status') || 'all';
  const filtered = useMemo(() => executions.filter((row) => (status === 'all' || row.status === status) && `${row.execution_id} ${row.tenant_id}`.toLowerCase().includes(query.trim().toLowerCase())), [executions, status, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const details = useExecutionDetails(rows, !paused);
  return <section className="panel live-table-panel">
    <div className="table-toolbar"><div className="search-input"><Search size={16} /><input aria-label="Search execution or tenant ID" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search execution or tenant ID..." /><kbd>/</kbd></div><div className="select-button status-select"><span className="filter-dot" /><select aria-label="Filter execution status" value={status} onChange={(event) => { setPage(0); setParams(event.target.value === 'all' ? {} : { status: event.target.value }); }}><option value="all">All statuses</option><option value="completed">Completed</option><option value="pending_approval">Pending user approval</option><option value="rejected">Rejected</option></select><ChevronDown size={13} /></div><span className="toolbar-record-count">{number(filtered.length)} executions</span></div>
    <div className="table-scroll"><table className="data-table live-table"><thead><tr><th>Timestamp</th><th>User ID</th><th>Status</th><th>Intent</th><th>Model</th><th className="number-cell">Tokens</th><th>Execution ID</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
      {loading ? <SkeletonRows columns={8} /> : rows.map((row) => {
        const meta = executionMeta(details[row.execution_id]);
        const notReported = details[row.execution_id] ? 'Not reported' : '...';
        return <tr className="clickable-row" key={row.execution_id} onClick={() => onSelect(row)}><td className="timestamp-cell"><span>{time(row.timestamp)}</span><small>{new Date(row.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></td><td className="mono small-text">{meta.userId || <span className="muted">{notReported}</span>}</td><td><StatusBadge status={row.status} /></td><td className="intent-cell">{meta.intent || <span className="muted">{notReported}</span>}</td><td><span className="model-label">{meta.model && <span className="tiny-dot purple" />}{meta.model.replace('Claude ', '') || <span className="muted">{notReported}</span>}</span></td><td className="mono number-cell">{meta.tokens === null ? <span className="muted">{notReported}</span> : number(meta.tokens)}</td><td><button className="execution-link mono" title={dateTime(row.timestamp)} aria-label={`View execution ${row.execution_id}`}>{row.execution_id}</button></td><td><ChevronRight className="row-chevron" size={14} /></td></tr>;
      })}
    </tbody></table></div>
    {!loading && !filtered.length && <EmptyState title={query || status !== 'all' ? 'No matching executions' : 'Your activity starts here'} description={query || status !== 'all' ? 'Try another execution ID or clear your status filter.' : 'New agent executions will appear automatically every five seconds.'} action={query || status !== 'all' ? <button className="button secondary" onClick={() => { setQuery(''); setParams({}); }}>Clear filters</button> : undefined} />}
    <div className="pagination"><span>Showing {filtered.length ? currentPage * pageSize + 1 : 0}-{Math.min((currentPage + 1) * pageSize, filtered.length)} of {number(filtered.length)}</span><div><label>Rows per page<select value={pageSize} aria-label="Rows per page" onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}><option value={15}>15</option><option value={30}>30</option><option value={50}>50</option></select></label><span>{currentPage + 1} of {pageCount}</span><button className="icon-button pagination-button" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><button className="icon-button pagination-button" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
    <div className="read-only-footnote"><ShieldCheck size={14} />Monitoring only. Customer consents are collected on your website, never in this console.</div>
  </section>;
}