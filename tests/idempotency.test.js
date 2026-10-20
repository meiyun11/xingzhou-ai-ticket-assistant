import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

test('重复提交、内容冲突、事务回滚与磁盘持久化', async () => {
  const path = fileURLToPath(new URL(`../data/test-${randomUUID()}.db`, import.meta.url));
  process.env.TICKET_DATABASE_PATH = path;
  const { db, createTicketOnce } = await import('../server/db.js');
  const ticket = { id: randomUUID(), title: '幂等验证', environment: '测试', occurredAt: '2026-10-20T12:00:00+08:00', errorCode: '401', reproductionSteps: '虚构步骤', status: 'open', createdAt: new Date().toISOString() };
  try {
    assert.equal(createTicketOnce(ticket, 'same-key', 'hash-a').kind, 'created');
    const replay = createTicketOnce({ ...ticket, id: randomUUID() }, 'same-key', 'hash-a');
    assert.equal(replay.kind, 'replayed');
    assert.equal(replay.ticket.id, ticket.id);
    assert.equal(createTicketOnce({ ...ticket, title: '不同内容' }, 'same-key', 'hash-b').kind, 'conflict');
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 1);

    db.exec(`CREATE TRIGGER fail_request BEFORE INSERT ON ticket_requests BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    assert.throws(() => createTicketOnce({ ...ticket, id: randomUUID() }, 'new-key', 'hash-c'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM tickets').get().n, 1, '请求凭据写入失败必须回滚工单');
    assert.equal(db.prepare('SELECT count(*) AS n FROM ticket_requests').get().n, 1);
  } finally { db.close(); }

  const reopened = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(reopened.prepare('SELECT ticket_id FROM ticket_requests WHERE idempotency_key = ?').get('same-key').ticket_id, ticket.id);
  } finally {
    reopened.close();
    unlinkSync(path); // 仅删除本测试创建的随机文件，不触及 tickets.db。
    delete process.env.TICKET_DATABASE_PATH;
  }
});
