import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronDown, ChevronRight, Copy, LogOut, Menu, Moon, Search, Settings2, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { navigation } from '../lib/navigation';
import { copyText } from '../lib/format';
import Logo from './Logo';

export default function Navbar({ onMenu, onSearch }) {
  const { session, logout } = useAuth();
  const { tenantId, tenants, setTenantId } = useData();
  const { theme, setTheme, notify } = useUI();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [popover, setPopover] = useState(null);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);
  const page = navigation.find((item) => item.path === pathname)?.label || 'Workspace';
  const name = session.name || session.email?.split('@')[0] || 'Admin';
  const initials = name.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  useEffect(() => {
    const outside = (event) => { if (!menuRef.current?.contains(event.target)) setPopover(null); };
    const escape = (event) => {
      if (event.key === 'Escape') {
        menuRef.current?.querySelector('[aria-expanded="true"]')?.focus();
        setPopover(null);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => { setPopover(null); }, [pathname]);
  const copyTenant = async () => {
    try { await copyText(tenantId); setCopied(true); notify('Tenant ID copied to clipboard.'); }
    catch (error) { notify(error.message, 'error'); }
  };
  return <header className="navbar">
    <div className="navbar-brand"><button className="icon-button mobile-menu-toggle" onClick={onMenu} aria-label="Open navigation"><Menu size={21} /></button><Link to="/" aria-label="AgentFlow overview"><Logo /></Link></div>
    <div className="navbar-main">
      <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><span className="breadcrumb-current">{page}</span></div>
      <div className="navbar-actions" ref={menuRef}>
        <button className="nav-search icon-button" onClick={onSearch} aria-label="Search workspace (Control K)" title="Search workspace (Ctrl K)"><Search size={18} /></button>
        <div className="popover-wrap tenant-wrap">
          <button className="tenant-switch" onClick={() => { setPopover(popover === 'tenant' ? null : 'tenant'); setCopied(false); }} aria-expanded={popover === 'tenant'} aria-label="Select monitoring workspace"><Building2 size={14} /><span>{tenantId}</span><ChevronDown size={13} /></button>
          {popover === 'tenant' && <div className="popover tenant-popover"><div className="popover-label">MONITORING WORKSPACE</div>{tenants.map((tenant) => <button className="menu-item" key={tenant.tenant_id} onClick={() => { navigate(pathname); setTenantId(tenant.tenant_id); setPopover(null); }}><Building2 size={15} /><span>{tenant.name}<small className="muted"> {tenant.tenant_id}</small></span>{tenantId === tenant.tenant_id && <Check size={15} />}</button>)}<p>Read-only access granted to your administrator workspace. Settings remain scoped to {session.tenant_id}.</p><button className="menu-item" onClick={copyTenant}>{copied ? <Check size={15} /> : <Copy size={15} />}Copy monitored tenant ID</button></div>}
        </div>
        <span className="navbar-divider" />
        <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <div className="popover-wrap">
          <button className="avatar-trigger" onClick={() => setPopover(popover === 'user' ? null : 'user')} aria-expanded={popover === 'user'} aria-label="Open account menu"><span className="avatar">{initials}</span><ChevronDown size={13} /></button>
          {popover === 'user' && <div className="popover user-popover"><div className="user-popover-profile"><span className="avatar large">{initials || <UserRound size={20} />}</span><div><strong>{name}</strong><span>{session.email}</span></div></div><div className="account-role"><ShieldCheck size={13} />Business administrator</div><div className="menu-separator" /><button className="menu-item" onClick={() => navigate('/settings')}><Settings2 size={16} />Workspace settings</button><button className="menu-item logout-item" onClick={() => { logout(); navigate('/login', { replace: true }); }}><LogOut size={16} />Log out</button></div>}
        </div>
      </div>
    </div>
  </header>;
}
