import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const lines = {
  purple: '0,31 8,25 16,28 24,20 32,24 40,13 48,18 56,9 64,15 72,5 80,9 88,1',
  green: '0,30 8,27 16,29 24,21 32,23 40,18 48,20 56,11 64,14 72,6 80,9 88,1',
  amber: '0,22 8,22 16,14 24,14 32,23 40,23 48,9 56,9 64,16 72,16 80,5 88,5',
};

export default function SummaryCard({ title, value, icon: Icon, trend, note, color = 'purple', onClick, loading, index = 0, showSparkline = false }) {
  const Tag = onClick ? motion.button : motion.div;
  return <Tag className={`summary-card ${color}`} onClick={onClick} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: index * 0.045 }} whileHover={onClick ? { y: -3, transition: { duration: 0.18 } } : undefined}>
    <div className="summary-card-heading"><span>{title}</span>{Icon && <Icon size={17} strokeWidth={1.65} />}</div>
    <div className="summary-card-body">{loading ? <span className="skeleton metric-skeleton" /> : <strong className={`metric-value ${typeof value === 'string' && value.length >= 12 ? 'metric-unavailable' : ''}`}>{value}</strong>}{showSparkline && <svg className="sparkline" width="80" height="37" viewBox="0 0 90 38" aria-hidden="true"><polyline points={lines[color] || lines.purple} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>
    <div className="summary-card-footer">{trend && <span className="metric-trend"><ArrowUpRight size={12} />{trend}</span>}{color === 'amber' && !trend && <span className="tiny-dot amber" />}<span>{note}</span></div>
  </Tag>;
}