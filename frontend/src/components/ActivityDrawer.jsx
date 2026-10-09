import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, BrainCircuit, Braces, Check, ChevronDown, Copy, ExternalLink, MessageSquare, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { requestError } from '../api/client';
import { copyText, dateTime, executionMeta, number } from '../lib/format';
import { ErrorBanner, LoadingState, Modal } from './Primitives';
import StatusBadge from './StatusBadge';

function DetailSection({ icon: Icon, title, children, count, open = true }) {
  return <details className="drawer-section" open={open}><summary><Icon size={17} /><span>{title}</span>{count !== undefined && <small>{count}</small>}<ChevronDown size={15} className="details-chevron" /></summary><div className="drawer-section-body">{children}</div></details>;
}

export default function ActivityDrawer({ execution, onClose }) {
  const { details, executions, loadDetail, lastUpdated } = useData();
  const { notify } = useUI();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const id = execution?.execution_id;
  const current = executions.find((row) => row.execution_id === id) || execution;
  const detail = details[id];
  const meta = executionMeta(detail);
  useEffect(() => {
    if (!id) return;
    let active = true;
    setError('');
    setLoading(true);
    setCopied(false);
    loadDetail(id, true).catch((failure) => { if (active) setError(requestError(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, loadDetail, retry, lastUpdated]);
  const copy = async (value) => {
    try { await copyText(value); setCopied(true); notify('Execution data copied to clipboard.'); }
    catch (failure) { notify(failure.message, 'error'); }
  };
  return <Modal open={!!execution} onClose={onClose} title="Execution details" className="activity-drawer">
    {execution && <><div className="drawer-intro"><div className="drawer-id"><code>{id}</code><button className="icon-button" onClick={() => copy(id)} aria-label="Copy execution ID">{copied ? <Check size={14} /> : <Copy size={14} />}</button></div><div className="drawer-meta-row"><StatusBadge status={current.status} /><time dateTime={current.timestamp}>{dateTime(current.timestamp)}</time></div></div>
      <div className="drawer-content"><ErrorBanner message={error} onRetry={() => setRetry((value) => value + 1)} />{loading && !detail ? <LoadingState label="Loading execution details..." /> : detail && <>
        <div className="execution-facts"><div><span>User ID</span><strong className="mono">{meta.userId || 'Not reported'}</strong></div><div><span>Model</span><strong>{meta.model || 'Not reported'}</strong></div><div><span>Tokens</span><strong>{meta.tokens === null ? 'Not reported' : number(meta.tokens)}</strong></div></div>
        <DetailSection icon={MessageSquare} title="User message"><p className="user-message-full">{meta.message || 'The API did not report a user message for this execution.'}</p>{meta.intent && <span className="detail-caption">Intent: {meta.intent}</span>}</DetailSection>
        <DetailSection icon={BookOpen} title="RAG chunks retrieved" count={meta.rag.length}>{meta.rag.length ? meta.rag.map((chunk, index) => <div className="rag-chunk" key={index}><div><span className="rag-index">{String(index + 1).padStart(2, '0')}</span><code>{chunk.source || chunk.document_id || `Source ${index + 1}`}</code>{typeof chunk.score === 'number' && <span className="rag-score">{Math.round(chunk.score * 100)}% match</span>}</div><p>{typeof chunk === 'string' ? chunk : chunk.content || chunk.text || JSON.stringify(chunk)}</p></div>) : <p className="muted">No retrieval chunks were reported.</p>}</DetailSection>
        <DetailSection icon={BrainCircuit} title="Model reasoning summary"><p>{meta.reasoning || 'No reasoning summary was included in the execution events.'}</p><span className="detail-caption">Operational summary only. Internal model reasoning is not displayed.</span></DetailSection>
        <DetailSection icon={Braces} title="Tool calls" count={meta.tools.length}>{meta.tools.length ? meta.tools.map((tool, index) => <div className="tool-call" key={index}><strong className="mono"><ArrowUpRight size={13} />{tool.tool || tool.name || `Tool call ${index + 1}`}</strong><pre>{JSON.stringify(tool.arguments || tool, null, 2)}</pre></div>) : <p className="muted">No tool calls were reported.</p>}</DetailSection>
        <DetailSection icon={ShieldCheck} title="Policy decision">{meta.policy ? <><div className={`policy-decision ${meta.policy.decision === 'deny' ? 'denied' : ''}`}><ShieldCheck size={17} /><strong>{String(meta.policy.decision || 'Reported').replaceAll('_', ' ')}</strong></div><p>{meta.policy.rule || meta.policy.message || 'The decision was recorded by the agent policy engine.'}</p></> : <p className="muted">No policy decision was reported.</p>}</DetailSection>
        <DetailSection icon={Sparkles} title="Final response">{meta.response ? <p>{meta.response}</p> : <div className="pending-response"><UserRound size={17} /><p>{current.status === 'pending_approval' ? 'Waiting for the customer to confirm in their website chat. No administrator action is required.' : 'No final response was included in this execution.'}</p></div>}</DetailSection>
      </>}</div>
      <div className="drawer-footer"><span><ShieldCheck size={14} />Read-only monitoring</span><button className="button primary" onClick={() => { navigate(`/audit?execution=${encodeURIComponent(id)}`); onClose(); }}>View audit trail<ExternalLink size={14} /></button></div>
    </>}
  </Modal>;
}