import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const dataDirectory = new URL('../data/', import.meta.url);
mkdirSync(dataDirectory, { recursive: true });
const databasePath = process.env.TICKET_DATABASE_PATH
  ? resolve(process.env.TICKET_DATABASE_PATH)
  : fileURLToPath(new URL('tickets.db', dataDirectory));
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    environment TEXT NOT NULL CHECK(environment IN ('开发', '测试', '生产')),
    occurred_at TEXT NOT NULL,
    error_code TEXT NOT NULL,
    reproduction_steps TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ticket_requests (
    idempotency_key TEXT PRIMARY KEY,
    request_hash TEXT NOT NULL,
    ticket_id TEXT NOT NULL REFERENCES tickets(id)
  );
`);

export const listTickets = db.prepare(`
  SELECT id, title, environment, occurred_at AS occurredAt,
         error_code AS errorCode, reproduction_steps AS reproductionSteps,
         status, created_at AS createdAt
  FROM tickets ORDER BY created_at DESC, id DESC LIMIT 100
`);
export const insertTicket = db.prepare(`
  INSERT INTO tickets
    (id, title, environment, occurred_at, error_code, reproduction_steps, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const findRequest = db.prepare('SELECT request_hash, ticket_id FROM ticket_requests WHERE idempotency_key = ?');
const saveRequest = db.prepare('INSERT INTO ticket_requests (idempotency_key, request_hash, ticket_id) VALUES (?, ?, ?)');
const findTicket = db.prepare(`
  SELECT id, title, environment, occurred_at AS occurredAt,
         error_code AS errorCode, reproduction_steps AS reproductionSteps,
         status, created_at AS createdAt FROM tickets WHERE id = ?
`);

export function createTicketOnce(ticket, key, hash) {
  // 将工单与请求凭据一起提交；任何一步失败都不应留下半条业务结果。
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = findRequest.get(key);
    if (previous) {
      const result = previous.request_hash === hash
        ? { kind: 'replayed', ticket: findTicket.get(previous.ticket_id) }
        : { kind: 'conflict' };
      db.exec('COMMIT');
      return result;
    }
    insertTicket.run(ticket.id, ticket.title, ticket.environment, ticket.occurredAt, ticket.errorCode, ticket.reproductionSteps, ticket.status, ticket.createdAt);
    saveRequest.run(key, hash, ticket.id);
    db.exec('COMMIT');
    return { kind: 'created', ticket };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
