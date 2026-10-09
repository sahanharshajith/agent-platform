import { ShieldCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import AuditViewer from '../components/AuditViewer';
import { ErrorBanner, PageHeader } from '../components/Primitives';

export default function AuditPage() {
  const { error, refresh } = useData();
  return <><PageHeader title="Audit Trail" description="Nothing behind the scenes. A clear record of every decision."><span className="read-only-label"><ShieldCheck size={15} />Read-only audit log</span></PageHeader><ErrorBanner message={error} onRetry={refresh} /><AuditViewer /></>;
}