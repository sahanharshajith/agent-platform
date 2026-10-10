// Normalize transport shapes without substituting example events or telemetry.
export function eventDetails(event) {
  const value = event.details ?? event.payload ?? {};
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return { text: value }; }
}

export function normalizeExecution(row) {
  return { ...row, execution_id: String(row.execution_id),
    status: row.status === 'denied' ? 'rejected' : row.status || 'unknown',
    timestamp: row.timestamp || row.created_at || null };
}

export function normalizeDetail(record) {
  return { ...normalizeExecution(record), events: (record.events || []).map((event) => (
    { ...event, details: eventDetails(event) }
  )) };
}

export function eventPresentation(event) {
  const data = eventDetails(event) || {};
  const result = data.result || {};
  const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);
  if (event.event_type === 'tool_call' && data.tool === 'streamsphere_account') {
    return { label: 'Account and refund policy lookup', summary: `StreamSphere returned the account${result.account?.subscription_status ? ` (${result.account.subscription_status})` : ''} and its refund policy.`, color: 'blue' };
  }
  if (event.event_type === 'tool_call' && data.tool === 'streamsphere_cancel_subscription') {
    const amount = result.refund_amount_cents;
    return { label: 'Subscription cancellation result', color: 'blue',
      summary: `${result.already_executed ? 'Previously processed action; callback replayed.' : 'StreamSphere returned the cancellation result.'}${result.account?.subscription_status ? ` Current subscription: ${result.account.subscription_status}.` : ''}${Number.isInteger(amount) ? ` Reported demo wallet credit: ${money(amount)}.` : ''}` };
  }
  if (event.event_type === 'approval_decision') return { label: 'Customer consent decision', color: data.approved === false ? 'amber' : 'green', summary: typeof data.approved === 'boolean' ? (data.approved ? 'The customer approved this action.' : 'The customer declined this action.') : data.message || '' };
  if (event.event_type === 'approval_request') return { label: 'Customer confirmation requested', color: 'amber', summary: data.reply || data.reason || '' };
  if (event.event_type === 'plan') return { label: 'Agent plan', color: 'purple', summary: data.action ? `Selected action: ${data.action.replaceAll('_', ' ')}.` : data.intent || '' };
  if (event.event_type === 'rag') return { label: 'Knowledge retrieval', color: 'purple', summary: `${(data.chunks || data.rag_chunks || []).length} recorded knowledge chunks.` };
  if (event.event_type === 'policy') return { label: 'Policy evaluation', color: 'amber', summary: data.reason || data.message || String(data.decision || '').replaceAll('_', ' ') };
  if (['error', 'tool_error'].includes(event.event_type)) return { label: event.event_type === 'tool_error' ? 'Business tool error' : 'Execution error', color: 'amber', summary: data.message || data.error || '' };
  return null;
}
