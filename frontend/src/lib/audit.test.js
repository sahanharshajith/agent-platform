import test from 'node:test';
import assert from 'node:assert/strict';
import { eventPresentation, normalizeDetail, normalizeExecution } from './audit.js';
import { executionMeta } from './format.js';

test('execution details expose saved business results and preserve missing versus zero usage', () => {
  const detail = normalizeDetail({ execution_id: 'real', events: [
    { event_type: 'user_message', payload: { content: 'Cancel my subscription', user_id: 'member-1' } },
    { event_type: 'plan', payload: { action: 'request_cancellation' } },
    { event_type: 'tool_call', payload: { tool: 'streamsphere_account', result: { account: { wallet_cents: 0 } } } },
  ] });
  const meta = executionMeta(detail);
  assert.equal(meta.message, 'Cancel my subscription');
  assert.equal(meta.userId, 'member-1');
  assert.equal(meta.intent, 'request_cancellation');
  assert.equal(meta.tokens, null);
  assert.equal(meta.model, '');
  assert.equal(meta.tools[0].result.account.wallet_cents, 0);
  detail.events.push({ event_type: 'final_response', details: { tokens_used: 0, text: 'Done' } });
  assert.equal(executionMeta(detail).tokens, 0);
  assert.equal(executionMeta(detail).response, 'Done');
});

test('unknown, failed and running states never become completed', () => {
  for (const status of ['failed', 'running', 'pending_approval', 'unreported']) {
    assert.equal(normalizeExecution({ execution_id: 'a', status }).status, status);
  }
  assert.equal(normalizeExecution({ execution_id: 'a' }).timestamp, null);
});

test('timeline accepts both persisted payload formats and retains event order', () => {
  const detail = normalizeDetail({ execution_id: 'cancel-1', status: 'completed', events: [
    { event_type: 'user_message', payload: JSON.stringify({ content: 'Cancel my subscription' }) },
    { event_type: 'tool_call', details: { tool: 'streamsphere_cancel_subscription', result: { refund_amount_cents: 1599 } } },
  ] });
  assert.equal(detail.events[0].details.content, 'Cancel my subscription');
  assert.equal(detail.events[1].details.result.refund_amount_cents, 1599);
});

test('account lookup and cancellation show only their recorded results', () => {
  const lookup = eventPresentation({ event_type: 'tool_call', details: { tool: 'streamsphere_account', result: { account: { subscription_status: 'active' } } } });
  assert.match(lookup.summary, /active/);
  const cancel = eventPresentation({ event_type: 'tool_call', details: { tool: 'streamsphere_cancel_subscription', result: { account: { subscription_status: 'cancelled' }, refund_amount_cents: 1599 } } });
  assert.match(cancel.summary, /\$15\.99/);
  assert.match(cancel.summary, /cancelled/);
  const missing = eventPresentation({ event_type: 'tool_call', details: { tool: 'streamsphere_cancel_subscription' } });
  assert.doesNotMatch(missing.summary, /credit|cancelled/);
});

test('declines, failures and replayed actions remain distinct', () => {
  assert.match(eventPresentation({ event_type: 'approval_decision', details: { approved: false } }).summary, /declined/);
  assert.equal(eventPresentation({ event_type: 'tool_error', details: { message: 'Timed out' } }).summary, 'Timed out');
  const replay = eventPresentation({ event_type: 'tool_call', details: { tool: 'streamsphere_cancel_subscription', result: { already_executed: true, account: { subscription_status: 'active' }, refund_amount_cents: 1599 } } });
  assert.match(replay.summary, /replayed/);
  assert.match(replay.summary, /active/);
});
