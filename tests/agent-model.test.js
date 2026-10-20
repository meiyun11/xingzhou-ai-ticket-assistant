import test from 'node:test';
import assert from 'node:assert/strict';
import { callAgentModel } from '../server/agent-model.js';
const getConfig = () => ({ key: 'test-key', model: 'test-model' });
test('工具协议请求与模型结构化调用保持一致', async () => {
  let sent;
  const expected = { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'probe_connection', arguments: '{"code":"local-check"}' } }] };
  const result = await callAgentModel({ messages: [{ role: 'user', content: 'test' }], tools: [], toolChoice: 'auto' }, { getConfig, fetchImpl: async (url, options) => { sent = { url, options }; return { ok: true, json: async () => ({ choices: [{ message: expected }] }) }; } });
  assert.deepEqual(result, expected);
  assert.equal(JSON.parse(sent.options.body).tool_choice, 'auto');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-key');
  assert.equal(sent.url, 'https://api.siliconflow.cn/v1/chat/completions');
});
test('模型错误与异常结构不得被伪装成工具调用成功', async () => {
  await assert.rejects(callAgentModel({ messages: [], tools: [] }, { getConfig, fetchImpl: async () => ({ ok: false, status: 402 }) }), /HTTP 402/);
  await assert.rejects(callAgentModel({ messages: [], tools: [] }, { getConfig, fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [] }) }) }), /no assistant message/);
});
