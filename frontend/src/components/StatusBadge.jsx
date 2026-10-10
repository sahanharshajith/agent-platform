const statuses = {
  completed: { label: 'completed', className: 'completed' },
  pending_approval: { label: 'pending user approval', className: 'pending' },
  rejected: { label: 'rejected', className: 'rejected' },
  failed: { label: 'failed', className: 'rejected' },
  running: { label: 'running', className: 'pending' },
};

export default function StatusBadge({ status }) {
  const definition = statuses[status] || { label: status || 'not reported', className: 'unknown' };
  return <span className={`status-badge ${definition.className}`}><span className="badge-dot" />{definition.label}</span>;
}
