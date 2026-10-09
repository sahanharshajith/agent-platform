import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, challenge, completeChallenge, cancelChallenge, enterDemo, previewAvailable } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeValue, setChallengeValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);
  const reason = new URLSearchParams(location.search).get('reason');
  const destination = location.state?.from?.startsWith('/') && !location.state.from.startsWith('//') ? location.state.from : '/';
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = challenge ? await completeChallenge(challengeValue) : await login(email, password);
      if (result.authenticated) { setPassword(''); setChallengeValue(''); navigate(destination, { replace: true }); }
      else if (result.challenge) setPassword('');
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  };
  const newPassword = challenge?.type === 'NEW_PASSWORD_REQUIRED';
  return <div className="login-form-wrap">
    <div className="login-form-heading"><span className="login-welcome-icon"><ShieldCheck size={23} strokeWidth={1.5} /></span><h1>{challenge ? newPassword ? 'A fresh start.' : 'One more step.' : 'Welcome back.'}</h1><p>{challenge ? newPassword ? 'Set a new password to secure your workspace.' : 'Enter the verification code from your phone or authenticator app.' : 'Your agents are moving. Let\'s check in.'}</p></div>
    {reason === 'session-expired' && !error && <div className="login-info">Your session has expired. Sign in again to continue securely.</div>}
    {error && <div className="login-error" role="alert"><CircleAlert size={17} /><span>{error}</span></div>}
    <form onSubmit={submit} className="login-form">{!challenge ? <><label className="field"><span>Work email</span><div className="login-input"><Mail size={17} /><input type="email" name="email" required autoComplete="username" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div></label><label className="field"><span>Password</span><div className="login-input"><LockKeyhole size={17} /><input type={visible ? 'text' : 'password'} name="password" required autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label></> : <label className="field"><span>{newPassword ? 'New password' : 'Verification code'}</span><input autoFocus type={newPassword ? 'password' : 'text'} required autoComplete={newPassword ? 'new-password' : 'one-time-code'} inputMode={newPassword ? 'text' : 'numeric'} minLength={newPassword ? 8 : 6} maxLength={newPassword ? 256 : 6} value={challengeValue} onChange={(event) => setChallengeValue(event.target.value)} /></label>}
      <button className="button primary login-submit" type="submit" disabled={loading}>{loading ? <LoaderCircle size={18} className="spin" /> : null}{loading ? 'Signing you in...' : challenge ? 'Continue securely' : 'Sign in to workspace'}{!loading && <ArrowRight size={17} />}</button>
    </form>
    {challenge ? <button className="login-help-button" onClick={() => { cancelChallenge(); setChallengeValue(''); setError(''); }}>Back to sign in</button> : <button className="login-help-button" onClick={() => setHelp(!help)} aria-expanded={help}>Trouble signing in?</button>}
    {help && <p className="login-help-text">Ask your workspace administrator to confirm your email, tenant assignment, and Cognito account status. Password resets are managed by your organization.</p>}
    <div className="login-demo"><div><span className="tiny-dot purple" /><strong>Take a look around</strong></div><p>Demo account: <span>admin@demo.com</span><br />Tenant: <code>boc-tenant-01</code></p>{previewAvailable ? <button className="button demo-login-button" onClick={() => { enterDemo(); navigate('/', { replace: true }); }}>Explore demo workspace<ArrowRight size={15} /></button> : <span className="demo-hint-note">Use the password assigned by your administrator.</span>}</div>
    <div className="login-security"><LockKeyhole size={12} />Secure authentication with Amazon Cognito</div>
  </div>;
}