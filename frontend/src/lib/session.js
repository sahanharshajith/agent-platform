export const SESSION_KEY = 'agentflow.session.v1';
export const SESSION_EVENT = 'agentflow:session-cleared';

export const configuration = {
  apiUrl: (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_BASE ||
    'http://localhost:8000'
  ).replace(/\/+$/, ''),
  poolId:
    import.meta.env.VITE_COGNITO_USER_POOL_ID ||
    import.meta.env.VITE_COGNITO_POOL_ID ||
    '',
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
};

export const isCognitoConfigured = Boolean(
  configuration.poolId &&
    configuration.clientId &&
    configuration.poolId !== 'YOUR_USER_POOL_ID' &&
    configuration.clientId !== 'YOUR_CLIENT_ID',
);

// Preview and demo mode is available for local testing and exploratory admin monitoring
export const previewAvailable = true;

export function createDemoToken(email = 'admin@demo.com', tenantId = 'boc-tenant-01') {
  try {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const exp = Math.floor(Date.now() / 1000) + 86400 * 7;
    const payload = btoa(
      JSON.stringify({
        sub: 'demo-admin-id',
        email: email,
        'custom:tenant_id': tenantId,
        'custom:tenant_name': 'Bank of Commerce',
        'custom:domain': 'portal.bankofcommerce.example',
        name: 'Alex Morgan',
        exp: exp,
        token_use: 'id',
        auth_time: Math.floor(Date.now() / 1000),
      }),
    );
    const sig = btoa('agentflow-demo-signature');
    return `${header}.${payload}.${sig}`;
  } catch {
    return 'demo-id-token';
  }
}

export function isLocalSession(session) {
  if (session?.auth_mode === 'local') return true;
  const token = session?.id_token;
  // Recognize sessions saved before local auth stopped sending synthetic JWTs.
  return typeof token === 'string' && (
    token === 'demo-id-token' ||
    token.split('.')[2] === btoa('agentflow-demo-signature')
  );
}

export const demoSession = {
  demo: false,
  auth_mode: 'local',
  tenant_id: 'boc-tenant-01',
  tenant_name: 'Bank of Commerce',
  domain: 'portal.bankofcommerce.example',
  email: 'admin@demo.com',
  name: 'Workspace Admin',
  id_token: '',
  expires_at: Date.now() + 86400000 * 7,
};

export function readSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!session || typeof session?.tenant_id !== 'string' || !session.tenant_id) {
      return null;
    }
    if (session.expires_at && Number.isFinite(session.expires_at) && session.expires_at <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function writeSession(session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Failed to persist session to localStorage:', err);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    for (const key of Object.keys(localStorage)) {
      if (configuration.clientId && key.startsWith(`CognitoIdentityServiceProvider.${configuration.clientId}.`)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* UI state and redirect still clear even when storage is unavailable. */
  }
  window.dispatchEvent(new Event(SESSION_EVENT));
}

let redirecting = false;
export function expireSession() {
  clearSession();
  if (!redirecting && window.location.pathname !== '/login') {
    redirecting = true;
    window.location.replace('/login?reason=session-expired');
  }
}
