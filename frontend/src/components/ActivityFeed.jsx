import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronRight, GitBranch } from 'lucide-react';
import { useData, useExecutionDetails } from '../context/DataContext';
import { dateTime, executionMeta, relativeTime } from '../lib/format';
import StatusBadge from './StatusBadge';
import { EmptyState, SkeletonRows } from './Primitives';

export default function ActivityFeed({ onSelect }) {
  const { executions, loading } = useData();
  const rows = executions.slice(0, 10);
  const details = useExecutionDetails(rows);
  return <motion.section className="panel activity-panel" initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.04 }} transition={{ duration: 0.25 }}>
    <div className="panel-header"><div><h2>Recent activity</h2><p>A closer look at your agents in action.</p></div><Link className="text-button subtle-link" to="/activity">View all activity<ArrowRight size={14} /></Link></div>
    <div className="table-scroll"><table className="data-table recent-table"><thead><tr><th>Execution ID</th><th>User message</th><th>Status</th><th className="time-column">Time</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>
      {loading ? <SkeletonRows count={5} columns={5} /> : rows.map((row, index) => {
        const meta = executionMeta(details[row.execution_id]);
        return <motion.tr key={row.execution_id} className="clickable-row" onClick={() => onSelect(row)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, delay: index * 0.025 }}>
          <td><button className="execution-link" aria-label={`View execution ${row.execution_id}`}><span className="execution-icon"><GitBranch size={14} /></span><span className="mono">{row.execution_id}</span></button></td>
          <td className="message-column"><span className={`truncate-message ${!meta.message ? 'muted' : ''}`} title={meta.message}>{meta.message || (details[row.execution_id] ? 'Message not reported' : 'Loading message...')}</span></td>
          <td><StatusBadge status={row.status} /></td><td className="time-column muted" title={dateTime(row.timestamp)}>{relativeTime(row.timestamp)}</td><td><ChevronRight className="row-chevron" size={15} /></td>
        </motion.tr>;
      })}
    </tbody></table></div>
    {!loading && !rows.length && <EmptyState />}
    {!!rows.length && <div className="table-footer"><span>Showing the {rows.length} most recent executions</span><span><span className="tiny-dot purple" />Every interaction. Full visibility.</span></div>}
  </motion.section>;
}