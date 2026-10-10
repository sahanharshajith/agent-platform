import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarDays, CheckCheck, ChevronDown, CircleHelp, Coins, Download, Hourglass, RefreshCw } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { compact, downloadCsv, number, relativeTime } from '../lib/format';
import SummaryCard from '../components/SummaryCard';
import ActivityFeed from '../components/ActivityFeed';
import { DistributionChart, VolumeChart } from '../components/Charts';
import { ErrorBanner, PageHeader } from '../components/Primitives';

export default function OverviewPage({ onSelect }) {
  const { executions, analytics, loading, refreshing, lastUpdated, error, refresh } = useData();
  const { notify } = useUI();
  const navigate = useNavigate();
  const [range, setRange] = useState('24h');
  const rangeDays = range === '24h' ? 1 : range === '7d' ? 7 : 30;
  const filtered = useMemo(() => executions.filter((row) => new Date(row.timestamp).getTime() >= Date.now() - rangeDays * 86_400_000), [executions, rangeDays]);

  const metrics = analytics || {};

  const chartData = useMemo(() => {
    return range === '24h' ? analytics?.hourly || [] : (analytics?.dailyExecutions || []).slice(-rangeDays);
  }, [analytics, range, rangeDays]);

  const distribution = useMemo(() => {
    const counts = range === '24h' ? analytics?.hourlyOutcomes || {} : Object.values(analytics?.dailyOutcomes || {}).slice(-rangeDays).reduce((total, day) => {
      for (const [status, count] of Object.entries(day)) total[status] = (total[status] || 0) + count;
      return total;
    }, {});
    return [
      { name: 'Completed', status: 'completed', color: '#10B981' },
      { name: 'Pending', status: 'pending_approval', color: '#F59E0B' },
      { name: 'Rejected', status: 'rejected', color: '#EF4444' },
      { name: 'Failed', status: 'failed', color: '#F87171' },
      { name: 'Running', status: 'running', color: '#38BDF8' },
      ...Object.keys(counts).filter((status) => !['completed', 'pending_approval', 'rejected', 'failed', 'running'].includes(status)).map((status) => ({ name: status, status, color: '#94A3B8' })),
    ].map((item) => ({
      ...item,
      value: counts[item.status] || 0,
    }));
  }, [analytics, range, rangeDays]);

  const total = chartData.reduce((sum, item) => sum + item.executions, 0);
  const outcomeTotal = distribution.reduce((sum, item) => sum + item.value, 0);
  const successRate = outcomeTotal ? `${(distribution[0].value / outcomeTotal * 100).toFixed(1)}%` : 'No data';
  const exportReport = () => {
    downloadCsv('agentflow-executions.csv', [['execution_id', 'timestamp', 'status', 'tenant_id'], ...filtered.map((row) => [row.execution_id, row.timestamp, row.status, row.tenant_id])]);
    notify(`${filtered.length} execution records exported.`);
  };
  return <>
    <PageHeader title="Overview" description="Your agents, at a glance. Everything is right here.">
      <div className="select-button"><CalendarDays size={15} /><select aria-label="Dashboard time range" value={range} onChange={(event) => setRange(event.target.value)}><option value="24h">Last 24 hours</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select><ChevronDown size={13} /></div>
      <button className="button secondary" onClick={exportReport} disabled={loading || !filtered.length}><Download size={15} /><span>Export report</span></button>
      <button className="icon-button bordered overview-refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh overview" title={lastUpdated ? `Updated ${relativeTime(lastUpdated).toLowerCase()}. Click to refresh.` : 'Refresh overview'}><RefreshCw size={14} className={refreshing ? 'spin' : ''} /></button>
    </PageHeader>
    <ErrorBanner message={error} onRetry={refresh} />
    <div className="summary-grid">
      <SummaryCard title="Total executions today" value={metrics.today == null ? 'Not reported' : number(metrics.today)} icon={Activity} note="Since midnight UTC" index={0} loading={loading} showSparkline={false} onClick={() => navigate('/activity')} />
      <SummaryCard title="Pending user consents" value={metrics.pending == null ? 'Not reported' : number(metrics.pending)} icon={Hourglass} note="Awaiting customer approval" color="amber" index={1} loading={loading} showSparkline={false} onClick={() => navigate('/activity?status=pending_approval')} />
      <SummaryCard title="Completed this week" value={metrics.completedWeek == null ? 'Not reported' : number(metrics.completedWeek)} icon={CheckCheck} note="Completed since Monday UTC" color="green" index={2} loading={loading} showSparkline={false} onClick={() => navigate('/audit?status=completed')} />
      <SummaryCard title="Reported tokens this month" value={metrics.monthlyTokens == null ? 'Not reported' : compact(metrics.monthlyTokens)} icon={Coins} note="Only recorded usage; missing counts are excluded" index={3} loading={loading} showSparkline={false} onClick={() => navigate('/usage')} />
    </div>
    <div className="overview-charts">
      <section className="panel volume-panel"><div className="panel-header"><div><h2>Execution volume</h2><p>Agent executions over the last {rangeDays === 1 ? '24 hours' : `${rangeDays} days`}.</p></div><div className="segmented-control" aria-label="Execution chart range">{[['24h', '24h'], ['7d', '7d'], ['30d', '30d']].map(([value, label]) => <button key={value} className={range === value ? 'selected' : ''} aria-pressed={range === value} onClick={() => setRange(value)}>{label}</button>)}</div></div><VolumeChart data={chartData} height={189} label={`Agent executions over the last ${rangeDays === 1 ? '24 hours' : `${rangeDays} days`}`} /><div className="panel-chart-footer"><span>{number(total)} executions in this period</span><span className="chart-legend"><span className="tiny-dot purple" />All agents</span></div></section>
      <section className="panel outcome-panel"><div className="panel-header"><div><h2>Execution outcomes</h2><p>Every status, in the selected period.</p></div><span className="help-icon" title="Recorded execution statuses in the selected period." tabIndex={0}><CircleHelp size={16} /></span></div><DistributionChart data={distribution} height={185} /><div className="success-rate-row"><span><span className="tiny-dot green" />Completion rate</span><strong>{successRate}<span className="muted"> of executions</span></strong></div></section>
    </div>
    <ActivityFeed onSelect={onSelect} />
  </>;
}
