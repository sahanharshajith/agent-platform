import { NavLink } from 'react-router-dom';
import { ArrowUpRight, BookOpen, ChevronsUpDown, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { navigation } from '../lib/navigation';

export default function Sidebar({ onNavigate, onHelp, mobile = false }) {
  const { session, isDemo } = useAuth();
  const { health } = useData();
  return <aside className={`sidebar ${mobile ? 'sidebar-mobile' : ''}`} aria-label="Workspace navigation">
    <NavLink className="workspace-switch" to="/settings" onClick={onNavigate} aria-label="View workspace settings"><span className="workspace-avatar">{(session.tenant_name || 'Workspace')[0]}</span><span className="workspace-info"><strong>{session.tenant_name || 'Your workspace'}</strong><span>{isDemo ? 'Demo workspace' : 'Business workspace'}</span></span><ChevronsUpDown size={14} /></NavLink>
    <div className="nav-section-label">WORKSPACE</div>
    <nav className="sidebar-nav">{navigation.map(({ path, label, icon: Icon }) => <NavLink key={path} to={path} end={path === '/'} onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{path === '/activity' && <span className="nav-live-dot" />}</NavLink>)}</nav>
    <div className="sidebar-bottom">
      <div className="sidebar-note"><ShieldCheck size={19} strokeWidth={1.5} /><div><strong>A little oversight.<br />A lot of possibility.</strong><p>Your agents, working together.</p></div></div>
      <button className="documentation-link" onClick={onHelp}><BookOpen size={16} /><span>Help & documentation</span><ArrowUpRight size={14} /></button>
      <div className="sidebar-status"><div><span className={`status-dot ${isDemo ? 'purple' : health === 'ok' ? 'green' : 'amber'}`} /><span>{isDemo ? 'Demo environment' : health === 'ok' ? 'All systems operational' : health === 'checking' ? 'Checking connection' : 'API connection unavailable'}</span></div><span className="sidebar-version">{isDemo ? 'Sample data, real possibilities' : 'Tenant-isolated. Always.'}<span>v1.0</span></span></div>
    </div>
  </aside>;
}