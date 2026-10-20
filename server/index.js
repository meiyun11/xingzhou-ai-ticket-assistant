import express from 'express';
import { saveTicket, validateTicketInput, TicketError } from './ticket-service.js';
import { runAgent } from './agent.js';
import { findTickets, saveDraft, confirmDraft } from './agent-store.js';
import { db, listTickets } from './db.js';
import { answerKnowledge, KnowledgeError } from './knowledge.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'ticket-api' });
});

app.post('/api/knowledge/ask', async (request, response, next) => {
  try { response.json(await answerKnowledge(request.body?.question)); }
  catch (error) {
    if (error instanceof KnowledgeError) return response.status(error.status).json({ error: error.message });
    next(error);
  }
});

app.get('/api/tickets', (_request, response) => {
  response.json({ items: listTickets.all() });
});

app.post('/api/tickets', (request, response, next) => {
  try {
    const result = saveTicket(request.body, request.get('Idempotency-Key'));
    response.set('Idempotency-Replayed', String(result.replayed));
    response.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

app.post('/api/agent/run', async (request, response) => {
  const message = request.body?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return response.status(400).json({ error: '任务必须为1–4000个字符' });
  try {
    response.json(await runAgent(message, { findTickets, saveDraft, validateDraft: validateTicketInput }));
  } catch (error) {
    // 不把模型原始消息或凭据返回浏览器。
    response.status(502).json({ error: error.message || 'Agent执行失败' });
  }
});

app.post('/api/agent/drafts/:id/confirm', (request, response, next) => {
  try {
    const result = confirmDraft(request.params.id, request.body?.confirmed);
    response.set('Idempotency-Replayed', String(result.replayed));
    response.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});
app.use((error, _request, response, _next) => {
  if (error instanceof TicketError) return response.status(error.status).json({ error: error.message });
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'JSON 格式错误' });
  if (error.type === 'entity.too.large') return response.status(413).json({ error: '请求体超过限制' });
  console.error('Request failed:', error.code ?? error.name);
  response.status(500).json({ error: '服务器内部错误' });
});

const server = app.listen(3100, '127.0.0.1', () => {
  console.log('Ticket API listening on http://127.0.0.1:3100');
});
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
