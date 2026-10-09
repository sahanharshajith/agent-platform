import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getAnalytics, getAudit, getAuditDetail, getHealth, getUsage, requestError } from '../api/client';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { session } = useAuth();
  const location = useLocation();
  const [executions, setExecutions] = useState([]);
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [health, setHealth] = useState('checking');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [paused, setPaused] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const alive = useRef(true);
  const refreshingRef = useRef(null);
  const cache = useRef(new Map());
  const requests = useRef(new Map());
  const controllers = useRef(new Set());

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controllers.current.forEach((controller) => controller.abort());
      controllers.current.clear();
      requests.current.clear();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (refreshingRef.current && !refreshingRef.current.signal.aborted) return;
    const controller = new AbortController();
    refreshingRef.current = controller;
    setRefreshing(true);
    controllers.current.add(controller);
    try {
      const [rows, stats, usageData] = await Promise.all([
        getAudit({ signal: controller.signal }),
        getAnalytics({ signal: controller.signal }),
        getUsage({ signal: controller.signal }),
      ]);
      if (!alive.current || controller.signal.aborted) return;
      const tenant = session?.tenant_id || 'boc-tenant-01';
      setExecutions(rows.filter((row) => !row.tenant_id || row.tenant_id === tenant).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      if (stats || usageData) {
        setAnalytics({ ...(stats || {}), ...(usageData || {}) });
      }
      setLastUpdated(Date.now());
      setError('');
    } catch (failure) {
      if (alive.current && failure.name !== 'AbortError' && failure.code !== 'ERR_CANCELED') setError(requestError(failure));
    } finally {
      controllers.current.delete(controller);
      if (refreshingRef.current === controller) {
        refreshingRef.current = null;
        if (alive.current && !controller.signal.aborted) { setLoading(false); setRefreshing(false); }
      }
    }
  }, [session?.tenant_id]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const result = await getHealth({ signal: controller.signal });
        if (!controller.signal.aborted) setHealth(result.status === 'ok' ? 'ok' : 'unavailable');
      } catch { if (!controller.signal.aborted) setHealth('unavailable'); }
    };
    check();
    const interval = setInterval(check, 60_000);
    return () => { clearInterval(interval); controller.abort(); };
  }, []);

  useEffect(() => {
    if (!['/activity', '/audit'].includes(location.pathname) || (paused && location.pathname === '/activity')) return;
    const tick = () => { if (!document.hidden) refresh(); };
    const interval = setInterval(tick, 5000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [location.pathname, paused, refresh]);

  const loadDetail = useCallback((id, force = false) => {
    if (!id) return Promise.resolve(null);
    const previous = cache.current.get(id);
    if (previous && !force && Date.now() - previous.updated < 15_000) return Promise.resolve(previous.data);
    if (requests.current.has(id)) return requests.current.get(id);
    const controller = new AbortController();
    controllers.current.add(controller);
    const request = getAuditDetail(id, { signal: controller.signal }).then((data) => {
      if (alive.current && !controller.signal.aborted) {
        cache.current.set(id, { data, updated: Date.now() });
        setDetails((current) => ({ ...current, [id]: data }));
      }
      return data;
    }).finally(() => {
      if (requests.current.get(id) === request) requests.current.delete(id);
      controllers.current.delete(controller);
    });
    requests.current.set(id, request);
    return request;
  }, []);

  return <DataContext.Provider value={{ executions, details, loading, refreshing, error, health, lastUpdated, paused, setPaused, refresh, loadDetail, analytics }}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);

export function useExecutionDetails(executions, poll = false) {
  const { loadDetail, details, lastUpdated } = useData();
  const ids = executions.map((execution) => execution.execution_id).join(',');
  const revision = poll ? lastUpdated : null;
  useEffect(() => {
    let cancelled = false;
    const queue = ids ? ids.split(',') : [];
    const worker = async () => {
      while (queue.length && !cancelled) {
        const id = queue.shift();
        try { await loadDetail(id, poll); } catch { /* Ignore retryable */ }
      }
    };
    const workers = Math.min(4, queue.length);
    for (let i = 0; i < workers; i += 1) worker();
    return () => { cancelled = true; };
  }, [ids, loadDetail, revision, poll]);
  return details;
}