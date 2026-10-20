import { randomUUID, createHash } from 'node:crypto';
import { createTicketOnce } from './db.js';

export class TicketError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function validateTicketInput(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new TicketError('请求体必须是 JSON 对象');
  const limits = { title: 120, environment: 2, occurredAt: 64, errorCode: 80, reproductionSteps: 4000 };
  const input = {};
  for (const [field, maxLength] of Object.entries(limits)) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > maxLength) throw new TicketError(`${field} 必须是非空字符串，且不超过 ${maxLength} 个字符`);
    input[field] = body[field].trim();
  }
  if (!['开发', '测试', '生产'].includes(input.environment)) throw new TicketError('environment 只能是开发、测试或生产');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(input.occurredAt) || !Number.isFinite(Date.parse(input.occurredAt))) throw new TicketError('occurredAt 必须是带时区的 ISO 时间');
  return input;
}
export function saveTicket(body, key) {
  const input = validateTicketInput(body);
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new TicketError('必须提供 8–128 位合法 Idempotency-Key 请求头');
  const ticket = { id: randomUUID(), ...input, status: 'open', createdAt: new Date().toISOString() };
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const result = createTicketOnce(ticket, key, hash);
  if (result.kind === 'conflict') throw new TicketError('同一个幂等键不能用于不同的工单内容', 409);
  return { ticket: result.ticket, replayed: result.kind === 'replayed' };
}
