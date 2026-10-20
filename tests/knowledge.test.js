import test from 'node:test';
import assert from 'node:assert/strict';
import { answerKnowledge, visibleAnswer } from '../server/knowledge.js';
const getConfig = () => ({ baseUrl: 'http://127.0.0.1:3001/api/v1', key: 'test-only-key', workspace: 'test-workspace' });

test('保留真实来源片段，只在服务端请求中使用Key', async () => {
  let sent;
  const result = await answerKnowledge(' 有效期？ ', { getConfig, fetchImpl: async (url, options) => {
    sent = { url, options };
    return { ok: true, json: async () => ({ type: 'textResponse', textResponse: '<think>internal-only-fixture</think>30 分钟', sources: [{ title: '规范', text: '有效期为30分钟' }], error: null }) };
  } });
  assert.equal(result.answer, '30 分钟');
  assert.equal(result.sources[0].snippet, '有效期为30分钟');
  assert.equal(JSON.parse(sent.options.body).mode, 'query');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-only-key');
  assert.ok(!JSON.stringify(result).includes('test-only-key'));
  assert.ok(!JSON.stringify(result).includes('internal-only-fixture'));
});

test('过滤多个、嵌套、大小写及不完整的think块，保留最终正文', () => {
  assert.equal(visibleAnswer('<THINK>fixture-a</THINK>答案<think>fixture-b</think>。'), '答案。');
  assert.equal(visibleAnswer('<think>a<think>b</think>c</think>答案'), '答案');
  assert.equal(visibleAnswer('<think>unfinished-fixture'), '');
  assert.equal(visibleAnswer('prefix-fixture</think>答案'), '答案');
  assert.equal(visibleAnswer('普通答案'), '普通答案');
});
test('只有think内容时拒绝返回空的成功答案', async () => {
  await assert.rejects(answerKnowledge('问题', { getConfig, fetchImpl: async () => ({ ok: true, json: async () => ({ textResponse: '<think>fixture-only</think>', sources: [] }) }) }), error => error.status === 502);
});
test('HTTP 200内的abort也必须作为失败处理', async () => {
  await assert.rejects(answerKnowledge('有效期？', { getConfig, fetchImpl: async () => ({ ok: true, json: async () => ({ type: 'abort', textResponse: null, error: 'upstream-private-detail' }) }) }), error => error.status === 502 && !error.message.includes('upstream-private-detail'));
});
test('无效问题不调用上游，超时和认证错误有明确映射', async () => {
  await assert.rejects(answerKnowledge(' ', { getConfig: () => { throw new Error('should not load config'); } }), error => error.status === 400);
  await assert.rejects(answerKnowledge('问题', { getConfig, fetchImpl: async () => { throw new DOMException('timeout', 'TimeoutError'); } }), error => error.status === 504);
  await assert.rejects(answerKnowledge('问题', { getConfig, fetchImpl: async () => ({ ok: false, status: 403 }) }), error => error.status === 502);
});
