import axios from 'axios';
import { configuration, expireSession, isLocalSession, readSession } from '../lib/session';

const API_BASE = configuration.apiUrl || 'http://localhost:8000';

const client = axios.create({
  baseURL: API_BASE,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
});

client.interceptors.request.use((request) => {
  // Allow health check without requiring an active session
  if (request.url?.includes('/health')) {
    return request;
  }
  const session = readSession();
  const token = session?.id_token;
  const tenantId = session?.tenant_id || 'boc-tenant-01';

  if (token && !isLocalSession(session)) {
    request.headers.set('Authorization', `Bearer ${token}`);
  } else {
    request.headers.delete('Authorization');
  }
  request.headers.set('X-Tenant-Id', tenantId);
  return request;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      expireSession();
    }
    return Promise.reject(error);
  },
);

export async function getHealth(options = {}) {
  try {
    const response = await client.get('/health', { signal: options.signal });
    return response.data;
  } catch (err) {
    return { status: 'unavailable', error: err.message };
  }
}

export async function getAudit(options = {}) {
  const { data } = await client.get('/audit', { signal: options.signal });
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.executions)
    ? data.executions
    : [];

  return list.map((row) => ({
    ...row,
    execution_id: String(row.execution_id),
    tenant_id: String(row.tenant_id || 'boc-tenant-01'),
    status: ['completed', 'pending_approval', 'rejected'].includes(row.status)
      ? row.status
      : 'completed',
    timestamp: row.timestamp || row.created_at || new Date().toISOString(),
  }));
}

export async function getAuditDetail(executionId, options = {}) {
  const { data } = await client.get(`/audit/${encodeURIComponent(executionId)}`, { signal: options.signal });
  return data;
}

export async function getAnalytics(options = {}) {
  try {
    const { data } = await client.get('/admin/analytics', { signal: options.signal });
    if (data && typeof data === 'object') {
      return data;
    }
  } catch (err) {
    console.error('Failed to fetch analytics from backend:', err);
  }
  return null;
}

export async function getUsage(options = {}) {
  try {
    const { data } = await client.get('/admin/usage', { signal: options.signal });
    if (data && typeof data === 'object') {
      return data;
    }
  } catch (err) {
    console.error('Failed to fetch usage from backend:', err);
  }
  return null;
}

export async function getSettings(options = {}) {
  try {
    const { data } = await client.get('/admin/settings', { signal: options.signal });
    return data;
  } catch (err) {
    return null;
  }
}

export async function updateSettings(settingsData, options = {}) {
  try {
    const { data } = await client.put('/admin/settings', settingsData, { signal: options.signal });
    return data;
  } catch (err) {
    return null;
  }
}

export async function rotateApiKey(options = {}) {
  try {
    const { data } = await client.post('/admin/rotate-key', {}, { signal: options.signal });
    return data;
  } catch (err) {
    return null;
  }
}

export function getPreviewAnalytics() {
  return null;
}

export function requestError(error) {
  if (error?.response?.status === 403) return 'Your account does not have access to this workspace. Contact your administrator.';
  if (error?.response?.status === 404) return 'This execution could not be found.';
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (error?.code === 'ERR_NETWORK') return 'We could not reach your API. Check the connection, base URL, and CORS configuration.';
  return error?.message || 'Something went wrong. Please try again.';
}

export default client;
