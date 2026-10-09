import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { Activity, ArrowUpRight, Check, GitBranch, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import Logo from '../components/Logo';
import Login from '../components/Login';

export default function LoginPage() {
  const { session } = useAuth();
  const { theme, setTheme } = useUI();
  useEffect(() => { document.title = 'Sign in | AgentFlow'; }, []);
  if (session) return <Navigate to="/" replace />;
  return <div className="login-page"><header className="login-page-header"><Logo /><button className="icon-button bordered" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></header><div className="login-layout">
    <motion.section className="login-story" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}><div className="login-story-eyebrow"><span className="tiny-dot purple" />INTELLIGENCE, IN GOOD HANDS.</div><div className="login-hero-brand">AgentFlow<span>.</span></div><h2>Let your agents work.<br /><span>Keep the bigger picture.</span></h2><p>One considered space to monitor your AI agents,<br className="desktop-break" /> understand their decisions, and move forward with confidence.</p><div className="login-flow" aria-label="AgentFlow connects user conversations, intelligent agents, and accountable outcomes"><div className="flow-line flow-line-one" /><div className="flow-line flow-line-two" /><motion.div className="flow-node flow-input" animate={{ y: [0, -4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}><GitBranch size={20} /><span>Every interaction</span></motion.div><div className="flow-center"><div className="flow-orbit" /><Logo markOnly /></div><motion.div className="flow-node flow-output" animate={{ y: [0, 4, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}><ShieldCheck size={20} /><span>Full confidence</span></motion.div><div className="flow-completed"><Check size={12} />Clarity at every step</div></div><div className="login-story-bottom"><Activity size={16} /><span>Built for autonomy. Designed for accountability.</span><ArrowUpRight size={14} /></div></motion.section>
    <motion.section className="login-form-section" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}><Login /></motion.section>
  </div><footer className="login-page-footer"><span>AgentFlow. Intelligence in motion.</span><span>Business administrator console</span></footer></div>;
}