import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

test('准备仅保存草稿，明确确认才写工单，同一草稿确认幂等', async () => {
  const path = fileURLToPath(new URL(`../data/confirm-test-${randomUUID()}.db`, import.meta.url));
  process.env.TICKET_DATABASE_PATH = path;
  const { saveDraft, confirmDraft } = await import('../server/agent-store.js');
  const { db } = await import('../server/db.js');
  try {
    const input = { title: '登录401', environment: '测试', errorCode: '401', occurredAt: '2026-10-20T12:00:00+08:00', reproductionSteps: '虚构步骤' };
    const draft = saveDraft(input, 'test-run');
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 0);
    assert.throws(() => confirmDraft(draft.id, false), /确认/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 0);
    const first = confirmDraft(draft.id, true);
    const repeated = confirmDraft(draft.id, true);
    assert.equal(first.replayed, false);
    assert.equal(repeated.replayed, true);
    assert.equal(first.ticket.id, repeated.ticket.id);
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 1);
    assert.throws(() => confirmDraft(randomUUID(), true), /不存在/);
  } finally { db.close(); delete process.env.TICKET_DATABASE_PATH; unlinkSync(path); }
});
