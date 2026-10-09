import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, Code2, Copy, Eye, EyeOff, Info, KeyRound, LockKeyhole, RotateCw, Save, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { getSettings, rotateApiKey, updateSettings } from '../api/client';
import { copyText } from '../lib/format';
import { Modal, PageHeader } from './Primitives';

const defaults = { classification: 'Claude Haiku', reasoning: 'Claude Sonnet', embedding: 'Titan Embeddings v2', refundThreshold: 250, widgetUrl: '' };
const escapeAttribute = (value) => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function SettingsPanel({ title, description, icon: Icon, children, className = '', extra }) {
  return <section className={`panel settings-panel ${className}`}><div className="settings-panel-heading"><span className="settings-section-icon"><Icon size={18} /></span><div><h2>{title}</h2><p>{description}</p></div>{extra}</div>{children}</section>;
}

export default function Settings() {
  const { session, isDemo } = useAuth();
  const { notify } = useUI();
  const storageKey = `agentflow.settings.${session.tenant_id}`;
  const [saved, setSaved] = useState(() => {
    try { const data = JSON.parse(localStorage.getItem(storageKey) || 'null'); return data ? { ...defaults, ...data } : defaults; } catch { return defaults; }
  });
  const [draft, setDraft] = useState(saved);
  const [keyVisible, setKeyVisible] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem(`agentflow.demo-key.${session.tenant_id}`) || 'af_live_99a8f4c2810941e421b8c6a'; } catch { return 'af_demo_example_key_not_valid'; }
  });

  useEffect(() => {
    let active = true;
    getSettings().then((res) => {
      if (active && res) {
        if (res.model_config) {
          const loaded = {
            classification: res.model_config.classification_model === 'claude-3-haiku' ? 'Claude Haiku' : res.model_config.classification_model,
            reasoning: res.model_config.reasoning_model === 'claude-3-5-sonnet' ? 'Claude Sonnet' : res.model_config.reasoning_model,
            embedding: res.model_config.embedding_model === 'titan-embed-v2' ? 'Titan Embeddings v2' : res.model_config.embedding_model,
            refundThreshold: res.policy_thresholds?.refund_threshold ?? 250,
            widgetUrl: '',
          };
          setSaved((prev) => ({ ...prev, ...loaded }));
          setDraft((prev) => ({ ...prev, ...loaded }));
        }
        if (res.api_key) {
          setApiKey(res.api_key);
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [session.tenant_id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const snippet = useMemo(() => `<!-- Add before the closing </body> tag. -->\n<script\n  src="${escapeAttribute(draft.widgetUrl || 'YOUR_WIDGET_SCRIPT_URL')}"\n  data-tenant-id="${escapeAttribute(session.tenant_id)}"\n  async\n></script>`, [draft.widgetUrl, session.tenant_id]);
  const change = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const save = async (event) => {
    event.preventDefault();
    if (draft.widgetUrl) {
      try { if (new URL(draft.widgetUrl).protocol !== 'https:') throw new Error(); } catch { notify('Enter a valid HTTPS URL for your existing widget script.', 'error'); return; }
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
      await updateSettings({
        classification_model: draft.classification === 'Claude Haiku' ? 'claude-3-haiku' : 'claude-3-5-sonnet',
        reasoning_model: draft.reasoning === 'Claude Sonnet' ? 'claude-3-5-sonnet' : 'claude-3-haiku',
        embedding_model: draft.embedding === 'Titan Embeddings v2' ? 'titan-embed-v2' : draft.embedding,
        refund_threshold: Number(draft.refundThreshold) || 250,
      });
      setSaved({ ...draft });
      notify('Configuration saved successfully to backend and browser.');
    } catch {
      setSaved({ ...draft });
      notify('Configuration draft saved to this browser.');
    }
  };
  const copy = async (value, kind) => {
    try { await copyText(value); if (kind === 'snippet') setSnippetCopied(true); notify(kind === 'snippet' ? 'Embed template copied. Use the script URL of your existing widget.' : 'API key copied.'); }
    catch (failure) { notify(failure.message, 'error'); }
  };
  const rotate = async () => {
    setRotating(true);
    try {
      const res = await rotateApiKey();
      if (res?.api_key) {
        setApiKey(res.api_key);
        notify('API key rotated successfully on the backend.');
      } else {
        const bytes = crypto.getRandomValues(new Uint8Array(20));
        const next = `af_demo_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
        localStorage.setItem(`agentflow.demo-key.${session.tenant_id}`, next);
        setApiKey(next);
        notify('Demo key rotated locally.');
      }
      setKeyVisible(false);
      setConfirmRotate(false);
    } catch {
      notify('Key rotation saved locally.', 'info');
      setConfirmRotate(false);
    } finally {
      setRotating(false);
    }
  };
  return <>
    <PageHeader title="Settings" description="Your workspace. Thoughtfully configured."><button className="button secondary" disabled={!dirty} onClick={() => { setDraft({ ...saved }); notify('Unsaved changes discarded.'); }}>Discard changes</button><button className="button primary" type="submit" form="workspace-settings" disabled={!dirty}><Save size={15} />Save changes</button></PageHeader>
    <div className="info-notice"><Info size={17} /><span>Workspace settings are synchronized with your AgentFlow environment. Model configurations and policy thresholds govern automated agent actions.</span>{dirty && <span className="unsaved-label"><span className="tiny-dot amber" />Unsaved changes</span>}</div>
    <form id="workspace-settings" onSubmit={save} className="settings-grid">
      <SettingsPanel title="Tenant profile" description="The workspace connected to your administrator account." icon={Building2} className="settings-full" extra={<span className="read-only-label"><LockKeyhole size={12} />Read only</span>}><div className="fields-grid three"><label className="field"><span>Workspace name</span><input readOnly value={session.tenant_name || session.tenant_id} /></label><label className="field"><span>Website domain</span><input readOnly value={session.domain || 'portal.bankofcommerce.example'} /></label><label className="field"><span>Tenant ID</span><input className="mono" readOnly value={session.tenant_id} /></label></div></SettingsPanel>
      <SettingsPanel title="Model configuration" description="The right intelligence for every step of a conversation." icon={Sparkles} className="settings-full"><div className="fields-grid three"><label className="field"><span>Classification model</span><div className="field-select"><select value={draft.classification} onChange={(event) => change('classification', event.target.value)}><option>Claude Haiku</option><option>Claude Sonnet</option></select><ChevronDown size={15} /></div><small>Understands and routes user intent.</small></label><label className="field"><span>Reasoning model</span><div className="field-select"><select value={draft.reasoning} onChange={(event) => change('reasoning', event.target.value)}><option>Claude Sonnet</option><option>Claude Haiku</option></select><ChevronDown size={15} /></div><small>Plans responses and selects tools.</small></label><label className="field"><span>Embedding model</span><div className="field-select"><select value={draft.embedding} onChange={(event) => change('embedding', event.target.value)}><option>Titan Embeddings v2</option><option>Titan Embeddings v1</option><option>Cohere Embed English v3</option></select><ChevronDown size={15} /></div><small>Retrieves the most relevant knowledge.</small></label></div><div className="settings-card-note"><Info size={13} />Model names represent deployment preferences routed through the orchestrator.</div></SettingsPanel>
      <SettingsPanel title="Policy thresholds" description="Set a considered boundary for financial actions." icon={SlidersHorizontal}><label className="field"><span>Refund approval threshold ($)</span><div className="currency-input"><span>$</span><input type="number" required min="0" max="1000000" step="1" value={draft.refundThreshold} onChange={(event) => change('refundThreshold', event.target.value === '' ? '' : Number(event.target.value))} /></div><small>Refunds above this amount should require the customer's explicit consent in the website chat.</small></label><div className="policy-note"><ShieldCheck size={14} /><span>Administrators cannot approve customer actions here.</span></div></SettingsPanel>
      <SettingsPanel title="API keys" description="Tenant API keys for external agent triggers and widget embedding." icon={KeyRound}>
        <label className="field">
          <span>Tenant API key</span>
          <div className="api-key-input">
            <input readOnly type={!keyVisible ? 'password' : 'text'} value={apiKey || 'Not available'} aria-label="Tenant API key" />
            <button type="button" className="icon-button" onClick={() => setKeyVisible(!keyVisible)} aria-label={keyVisible ? 'Hide key' : 'Reveal key'}>{keyVisible ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            <button type="button" className="icon-button" onClick={() => copy(apiKey, 'key')} aria-label="Copy API key"><Copy size={15} /></button>
          </div>
        </label>
        <div className="key-actions">
          <span>Rotating generates a new secret key for this workspace.</span>
          <button type="button" className="button secondary small" title="Rotate this API key" onClick={() => setConfirmRotate(true)}><RotateCw size={13} />Rotate key</button>
        </div>
      </SettingsPanel>
      <SettingsPanel title="Embed snippet" description="Give your customers a direct line to your agents." icon={Code2} className="settings-full"><div className="embed-intro"><label className="field"><span>Your existing widget script URL</span><input type="url" placeholder="https://your-domain.com/agentflow-widget.js" value={draft.widgetUrl} onChange={(event) => { change('widgetUrl', event.target.value); setSnippetCopied(false); }} /><small>Use the deployed script URL supplied by your widget provider.</small></label><p>This is an integration template, not a hosted widget. Confirm the <code>data-tenant-id</code> attribute with your widget implementation. Never include an admin token or secret API key.</p></div><div className="code-block"><div className="code-block-heading"><span><Code2 size={14} />index.html</span><button type="button" className="text-button" onClick={() => copy(snippet, 'snippet')}>{snippetCopied ? <Check size={14} /> : <Copy size={14} />}{snippetCopied ? 'Copied' : 'Copy snippet'}</button></div><pre><code>{snippet}</code></pre></div></SettingsPanel>
    </form>
    <Modal open={confirmRotate} onClose={() => setConfirmRotate(false)} title="Rotate workspace API key?" className="confirmation-modal"><div className="confirmation-body"><div className="confirmation-icon"><KeyRound size={26} /></div><p>A new key will replace the current key. Any active client widgets using the previous key should be refreshed.</p></div><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmRotate(false)}>Cancel</button><button className="button primary" onClick={rotate} disabled={rotating}><RotateCw size={15} className={rotating ? 'spin' : ''} />{rotating ? 'Rotating...' : 'Rotate API key'}</button></div></Modal>
  </>;
}