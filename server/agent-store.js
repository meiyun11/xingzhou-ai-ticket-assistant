import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { saveTicket, TicketError } from './ticket-service.js';

db.exec(`CREATE TABLE IF NOT EXISTS ticket_drafts (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL
)`);
const matches = db.prepare(`SELECT id, title, environment, error_code AS errorCode, status, created_at AS createdAt
  FROM tickets WHERE environment = ? AND error_code = ? AND status = 'open' ORDER BY created_at DESC LIMIT 20`);
const countMatches = db.prepare("SELECT count(*) AS total FROM tickets WHERE environment = ? AND error_code = ? AND status = 'open'");
const insertDraft = db.prepare('INSERT INTO ticket_drafts (id, run_id, payload, created_at) VALUES (?, ?, ?, ?)');
const selectDraft = db.prepare('SELECT payload FROM ticket_drafts WHERE id = ?');
export function findTickets({ environment, errorCode }) {
  return { items: matches.all(environment, errorCode), total: countMatches.get(environment, errorCode).total };
}
export function saveDraft(input, runId) {
  const draft = { id: randomUUID(), ...input, createdAt: new Date().toISOString() };
  insertDraft.run(draft.id, runId, JSON.stringify(input), draft.createdAt);
  return draft;
}
export function confirmDraft(id, confirmed) {
  if (confirmed !== true) throw new TicketError('必须明确确认后才能创建工单');
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new TicketError('草稿标识无效');
  const draft = selectDraft.get(id);
  if (!draft) throw new TicketError('草稿不存在', 404);
  // 确认时重新校验服务端保存的草稿；不接受浏览器替换字段。
  return saveTicket(JSON.parse(draft.payload), `draft_${id}`);
}
