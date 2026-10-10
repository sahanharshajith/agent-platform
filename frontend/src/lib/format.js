import { eventDetails } from './audit.js';

export const number = (value) => new Intl.NumberFormat('en-US').format(value);
export const compact = (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
export const time = (value) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
export const dateTime = (value) => new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function relativeTime(value) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { text: value };
    } catch { return { text: value }; }
  }
  return {};
}

export function asText(value) {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function executionMeta(detail) {
  const result = { message: '', userId: '', intent: '', model: '', tokens: null, rag: [], reasoning: '', tools: [], policy: null, response: '' };
  for (const event of detail?.events || []) {
    const data = asObject(eventDetails(event));
    result.userId = asText(data.user_id) || result.userId;
    result.intent = asText(data.intent || (event.event_type === 'plan' ? data.action : '')) || result.intent;
    result.model = asText(data.model) || result.model;
    result.reasoning = asText(data.reasoning_summary || data.model_reasoning_summary) || result.reasoning;
    const chunks = data.rag_chunks || (event.event_type === 'rag' ? data.chunks : null);
    if (Array.isArray(chunks)) result.rag = chunks.filter((chunk) => chunk != null).map((chunk, index) => ({ source: asText(chunk.source || chunk.document_id) || `Source ${index + 1}`, content: typeof chunk === 'string' ? chunk : asText(chunk.content || chunk.text || chunk), score: chunk.score }));
    const usage = data.usage || data.token_usage;
    const tokens = typeof data.tokens === 'number' ? data.tokens : data.tokens_used ?? usage?.total_tokens ?? (typeof usage?.input_tokens === 'number' && typeof usage?.output_tokens === 'number' ? usage.input_tokens + usage.output_tokens : null);
    if (Number.isFinite(tokens) && tokens >= 0) result.tokens = tokens;
    if (event.event_type === 'user_message') result.message = asText(data.message || data.content || data.user_message || data.text);
    if (event.event_type === 'tool_call') result.tools.push({ ...data, tool: asText(data.tool || data.name) });
    if (event.event_type === 'policy') result.policy = { ...data, decision: asText(data.decision), rule: asText(data.rule), message: asText(data.message) };
    if (event.event_type === 'final_response') result.response = asText(data.response || data.content || data.message || data.text);
  }
  return result;
}

export function hourlyExecutions(rows) {
  const end = new Date();
  end.setMinutes(0, 0, 0);
  const start = end.getTime() - 23 * 3_600_000;
  const buckets = Array.from({ length: 24 }, (_, index) => ({ label: time(start + index * 3_600_000), executions: 0 }));
  for (const row of rows) {
    const index = Math.floor((new Date(row.timestamp).getTime() - start) / 3_600_000);
    if (index >= 0 && index < 24) buckets[index].executions += 1;
  }
  return buckets;
}

export function dailyExecutions(rows, days) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: days }, (_, index) => {
    const day = new Date(now);
    day.setDate(day.getDate() - (days - index - 1));
    return { date: day.toDateString(), label: day.toLocaleDateString('en-US', days === 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }), executions: 0 };
  });
  for (const row of rows) {
    const bucket = buckets.find((item) => item.date === new Date(row.timestamp).toDateString());
    if (bucket) bucket.executions += 1;
  }
  return buckets;
}

export async function copyText(text) {
  if (!navigator.clipboard) throw new Error('Clipboard access requires HTTPS. You can select and copy the text manually.');
  await navigator.clipboard.writeText(text);
}

export function downloadCsv(filename, rows) {
  const escape = (value) => {
    let text = String(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
