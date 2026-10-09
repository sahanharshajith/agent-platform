import { useState } from 'react';
import { ArrowRight, CalendarDays, ChartNoAxesCombined, ChevronDown, ChevronRight, CircleHelp, Coins, DollarSign, Download, Gauge, Info, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useData, useExecutionDetails } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { compact, dateTime, downloadCsv, executionMeta, number, relativeTime } from '../lib/format';
import SummaryCard from './SummaryCard';
import { DistributionChart, VolumeChart } from './Charts';
import { EmptyState, ErrorBanner, PageHeader, SkeletonRows } from './Primitives';

export default function TokenUsage({ onSelect }) {
  const { executions, analytics, loading, error, refresh } = useData();
  const { notify } = useUI();
  const [range, setRange] = useState(30);
  const rows = executions.slice(0, 10);
  const details = useExecutionDetails(rows);
  const exportUsage = () => {
    downloadCsv('agentflow-observed-token-usage.csv', [['execution_id', 'timestamp', 'model', 'reported_tokens'], ...rows.map((row) => { const meta = executionMeta(details[row.execution_id]); return [row.execution_id, row.timestamp, meta.model, meta.tokens ?? 'Not reported']; })]);
    notify('Token usage for the displayed executions exported.');
  };
  return <>
    <PageHeader title="Token Usage" description="Understand your usage. Make every token count."><div className="select-button"><CalendarDays size={15} /><select value={range} onChange={(event) => setRange(Number(event.target.value))} aria-label="Token chart date range"><option value={30}>Last 30 days</option><option value={7}>Last 7 days</option></select><ChevronDown size={13} /></div><button className="button secondary" onClick={exportUsage} disabled={!rows.length}><Download size={15} />Export usage</button></PageHeader>
    <ErrorBanner message={error} onRetry={refresh} />
    {!analytics && <div className="info-notice"><Info size={17} /><span>The current API does not expose monthly usage, budgets, pricing, or active sessions. Per-execution tokens are shown when included in audit event details.</span></div>}
    <div className="summary-grid usage-summary-grid">
      <SummaryCard title="Tokens used this month" value={analytics ? compact(analytics.monthlyTokens) : 'Not reported'} icon={Coins} note={analytics ? '24% of your monthly budget' : 'Usage endpoint not available'} loading={loading} showSparkline={!!analytics} onClick={() => document.getElementById('daily-token-usage')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })} />
      <SummaryCard title="Remaining budget" value={analytics ? compact(analytics.remainingBudget) : 'Not reported'} icon={Gauge} note={analytics ? '76% available this month' : 'Budget endpoint not available'} color="green" index={1} loading={loading} showSparkline={!!analytics} />
      <SummaryCard title="Cost estimate" value={analytics ? `$${analytics.cost.toFixed(2)}` : 'Not reported'} icon={DollarSign} note={analytics ? 'Estimated monthly spend' : 'Pricing endpoint not available'} index={2} loading={loading} showSparkline={!!analytics} />
      <SummaryCard title="Active sessions" value={analytics ? number(analytics.activeSessions) : 'Not reported'} icon={Users} note={analytics ? 'Across your active workspace' : 'Sessions endpoint not available'} index={3} loading={loading} showSparkline={!!analytics} />
    </div>
    <div className="usage-charts"><section className="panel" id="daily-token-usage"><div className="panel-header"><div><h2>Daily token usage</h2><p>Your consumption over the last {range} days.</p></div><span className="chart-legend"><span className="tiny-dot purple" />Total tokens</span></div>{analytics ? <><div className="chart-metric-row"><div><strong>{compact(analytics.dailyTokens.slice(-range).reduce((sum, day) => sum + day.tokens, 0))}</strong><span>tokens consumed</span></div></div><VolumeChart data={analytics.dailyTokens.slice(-range)} dataKey="tokens" label={`Daily token usage over the last ${range} days`} height={230} /></> : <EmptyState icon={ChartNoAxesCombined} title="Usage data is not available" description="Your existing endpoints do not provide aggregate token usage." />}</section><section className="panel"><div className="panel-header"><div><h2>Usage by model</h2><p>Token distribution this month.</p></div><span className="help-icon" title="Token counts by model. These are not billed dollar amounts." tabIndex={0}><CircleHelp size={16} /></span></div>{analytics ? <><DistributionChart data={analytics.modelTokens} dataKey="tokens" horizontal height={214} /><div className="model-budget-footer"><span>Total model usage</span><strong>{compact(analytics.monthlyTokens)} tokens</strong></div></> : <EmptyState icon={Coins} title="No model totals reported" description="Model aggregates are not part of the current API contract." />}</section></div>
    <section className="panel">
      <div className="panel-header"><div><h2>Usage by execution</h2><p>Reported token counts for your latest conversations.</p></div><Link to="/activity" className="text-button subtle-link">View all executions<ArrowRight size={14} /></Link></div>
      <div className="table-scroll"><table className="data-table usage-table">
        <thead><tr><th>Execution ID</th><th>Model</th><th>User message</th><th className="number-cell">Tokens used</th><th>Time</th><th><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{loading ? <SkeletonRows columns={6} /> : rows.map((row) => {
          const meta = executionMeta(details[row.execution_id]);
          return <tr key={row.execution_id} className="clickable-row" onClick={() => onSelect(row)}>
            <td><button className="execution-link mono" aria-label={`View token details for ${row.execution_id}`}>{row.execution_id}</button></td>
            <td><span className="model-label"><span className="tiny-dot purple" />{meta.model || 'Not reported'}</span></td>
            <td><span className="truncate-message">{meta.message || 'Not reported'}</span></td>
            <td className="number-cell mono token-total">{meta.tokens === null ? <span className="muted">Not reported</span> : number(meta.tokens)}</td>
            <td className="muted" title={dateTime(row.timestamp)}>{relativeTime(row.timestamp)}</td>
            <td><ChevronRight size={14} className="row-chevron" /></td>
          </tr>;
        })}</tbody>
      </table></div>
      {!loading && !rows.length && <EmptyState />}
      <div className="table-footer"><span>Showing the {rows.length} most recent executions</span><span>Usage is read-only</span></div>
    </section>
  </>;
}