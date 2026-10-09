import { Component, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { ArrowLeft, CircleAlert, ShieldCheck } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { UIProvider } from './context/UIContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ActivityDrawer from './components/ActivityDrawer';
import CommandMenu from './components/CommandMenu';
import HelpDialog from './components/HelpDialog';
import { EmptyState, Modal } from './components/Primitives';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import LiveActivityPage from './pages/LiveActivityPage';
import AuditPage from './pages/AuditPage';
import UsagePage from './pages/UsagePage';
import SettingsPage from './pages/SettingsPage';
import { navigation } from './lib/navigation';

class AppErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="fatal-error"><CircleAlert size={30} /><h1>Let's get you back on track.</h1><p>The console encountered an unexpected error. Your backend data has not been changed.</p><button className="button primary" onClick={() => window.location.reload()}>Reload workspace</button></div>;
    return this.props.children;
  }
}

function DashboardShell() {
  const { isDemo } = useAuth();
  const location = useLocation();
  const [selected, setSelected] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    const keyboard = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen((open) => !open); }
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !document.activeElement?.isContentEditable) { event.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);
  useEffect(() => {
    const title = navigation.find((item) => item.path === location.pathname)?.label || 'Workspace';
    document.title = `${title} | AgentFlow`;
    setSelected(null);
    setMobileNav(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <Navbar onMenu={() => setMobileNav(true)} onSearch={() => setCommandOpen(true)} />
    <Sidebar onHelp={() => setHelpOpen(true)} />
    <main id="main-content" className="dashboard-main" tabIndex={-1}>
      <AnimatePresence mode="wait" initial={false}><motion.div className="page-content" key={location.pathname} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.18 }}><Routes location={location}><Route path="/" element={<OverviewPage onSelect={setSelected} />} /><Route path="/activity" element={<LiveActivityPage onSelect={setSelected} />} /><Route path="/audit" element={<AuditPage />} /><Route path="/usage" element={<UsagePage onSelect={setSelected} />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<EmptyState title="This page took a different path." description="Let's head back to your workspace overview." action={<Link className="button primary" to="/"><ArrowLeft size={16} />Back to overview</Link>} />} /></Routes></motion.div></AnimatePresence>
      <footer className="app-footer"><span><span className="footer-brand">AgentFlow</span><span className="footer-separator">/</span>{isDemo ? 'Demo workspace. Illustrative data.' : 'Intelligence in motion.'}</span><span><ShieldCheck size={13} />Read-only monitoring<span className="footer-dot" /></span></footer>
    </main>
    <ActivityDrawer execution={selected} onClose={() => setSelected(null)} />
    <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
    <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    <Modal open={mobileNav} onClose={() => setMobileNav(false)} title="Your workspace" className="navigation-drawer"><Sidebar mobile onNavigate={() => setMobileNav(false)} onHelp={() => { setMobileNav(false); setHelpOpen(true); }} /></Modal>
  </div>;
}

function ProtectedDashboard() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <DataProvider key={`${session.tenant_id}-${session.demo ? 'demo' : 'live'}`}><DashboardShell /></DataProvider>;
}

export default function AgentFlowApp() {
  return <AppErrorBoundary><MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}><BrowserRouter><AuthProvider><UIProvider><Routes><Route path="/login" element={<LoginPage />} /><Route path="/*" element={<ProtectedDashboard />} /></Routes></UIProvider></AuthProvider></BrowserRouter></MotionConfig></AppErrorBoundary>;
}