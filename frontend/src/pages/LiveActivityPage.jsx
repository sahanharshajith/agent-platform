import { Download, Pause, Play, RefreshCw } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { downloadCsv, relativeTime } from '../lib/format';
import LiveActivityTable from '../components/LiveActivityTable';
import { ErrorBanner, PageHeader } from '../components/Primitives';

export default function LiveActivityPage({ onSelect }) {
  const { executions, error, refreshing, refresh, paused, setPaused, lastUpdated } = useData();
  const { notify } = useUI();
  const togglePause = () => { setPaused(!paused); if (paused) refresh(); notify(paused ? 'Live updates resumed. Refreshing every 5 seconds.' : 'Live updates paused. You can still inspect executions.'); };
  return <>
    <PageHeader title="Live Agent Activity" description="Every conversation. Every action. As it happens."><button className="button secondary" onClick={togglePause}>{paused ? <Play size={15} /> : <Pause size={15} />}{paused ? 'Resume updates' : 'Pause updates'}</button><button className="button secondary" onClick={() => { downloadCsv('agentflow-live-activity.csv', [['execution_id', 'timestamp', 'status', 'tenant_id'], ...executions.map((row) => [row.execution_id, row.timestamp, row.status, row.tenant_id])]); notify('Activity report exported.'); }} disabled={!executions.length}><Download size={15} />Export</button></PageHeader>
    <ErrorBanner message={error} onRetry={refresh} />
    <div className="activity-status-row"><div><span className={`live-indicator ${paused ? 'paused' : ''}`}><span className="status-dot" />{paused ? 'Paused' : 'Live'}</span><span className="muted">{paused ? 'Automatic updates are paused' : 'Automatically refreshing every 5 seconds'}</span></div><button className="refresh-label" onClick={refresh} disabled={refreshing}><RefreshCw size={13} className={refreshing ? 'spin' : ''} />{refreshing ? 'Updating...' : lastUpdated ? `Updated ${relativeTime(lastUpdated).toLowerCase()}` : 'Connecting...'}</button></div>
    <LiveActivityTable onSelect={onSelect} />
  </>;
}