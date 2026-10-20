import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../server/agent.js';
const input = { title: '登录401', environment: '测试', errorCode: '401', occurredAt: '2026-10-20T12:00:00+08:00', reproductionSteps: '虚构测试步骤' };
const message = `测试登录401，时间${input.occurredAt}，请准备草稿`;
const call = (name, args, id) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const search = call('search_knowledge', { question: '工单规范' }, 'search');
const query = call('query_tickets', { environment: '测试', errorCode: '401' }, 'query');
const prepare = call('prepare_ticket', input, 'prepare');
function dependencies(calls) {
  let round = 0;
  let saves = 0;
  return {
    get saves() { return saves; },
    model: async () => round++ === 0 ? { role: 'assistant', content: null, tool_calls: calls } : { role: 'assistant', content: '请审核草稿' },
    knowledge: async () => ({ answer: '规范', sources: [{ id: 1, title: '规范', snippet: '工单字段', truncated: false }] }),
    findTickets: () => ({ items: [{ id: 'existing', title: '已有问题' }], total: 1 }),
    validateDraft: value => value,
    saveDraft: value => { saves++; return { id: 'draft-only', ...value }; },
  };
}
test('模型选择三种工具，返回来源、重复提示与草稿，没有创建工具', async () => {
  const deps = dependencies([search, query, prepare]);
  const result = await runAgent(message, deps);
  assert.equal(result.trace.length, 3);
  assert.ok(result.trace.every(step => step.status === 'success'));
  assert.equal(result.draft.id, 'draft-only');
  assert.equal(result.relatedTotal, 1);
  assert.equal(deps.saves, 1);
});
test('未授权工具、非法参数和未查规范就准备草稿均被拒绝', async () => {
  const deps = dependencies([call('create_ticket', input, 'bad-tool'), { ...search, id: 'bad-json', function: { name: 'search_knowledge', arguments: '{bad-json' } }, prepare]);
  const result = await runAgent(message, deps);
  assert.ok(result.trace.every(step => step.status === 'error'));
  assert.equal(deps.saves, 0);
  assert.equal(result.draft, null);
});
test('查询条件或用户时间不匹配时不得保存草稿', async () => {
  for (const changed of [{ ...input, environment: '生产' }, { ...input, occurredAt: '2026-10-21T12:00:00+08:00' }]) {
    const deps = dependencies([search, query, call('prepare_ticket', changed, 'mismatch')]);
    const result = await runAgent(message, deps);
    assert.equal(result.trace[2].status, 'error');
    assert.equal(deps.saves, 0);
  }
});
test('超过工具调用预算时停止', async () => {
  const deps = dependencies(Array.from({ length: 9 }, (_, index) => ({ ...search, id: String(index) })));
  await assert.rejects(runAgent(message, deps), /上限/);
  assert.equal(deps.saves, 0);
});
