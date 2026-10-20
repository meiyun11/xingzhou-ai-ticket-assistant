export interface TicketInput {
  title: string;
  environment: '开发' | '测试' | '生产';
  occurredAt: string;
  errorCode: string;
  reproductionSteps: string;
}
export interface Ticket extends TicketInput {
  id: string;
  status: 'open' | 'closed';
  createdAt: string;
}

async function request<T>(path: string, options?: RequestInit, timeout = 15000): Promise<T> {
  const response = await fetch(path, { ...options, signal: AbortSignal.timeout(timeout) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data as T;
}

export function fetchTickets() {
  return request<{ items: Ticket[] }>('/api/tickets');
}
export function createTicket(input: TicketInput, idempotencyKey: string) {
  return request<{ ticket: Ticket; replayed: boolean }>('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export interface KnowledgeAnswer {
  answer: string;
  sources: { id: number; title: string; snippet: string; truncated: boolean }[];
  mode: 'query';
}
export function askKnowledge(question: string) {
  return request<KnowledgeAnswer>('/api/knowledge/ask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }),
  }, 105000);
}

export interface AgentResult {
  runId: string;
  answer: string;
  trace: { tool: string; status: string; summary: string; durationMs: number }[];
  sources: KnowledgeAnswer['sources'];
  relatedTickets: Ticket[];
  relatedTotal: number;
  draft: (TicketInput & { id: string; createdAt: string }) | null;
}
export function runAgentTask(message: string) {
  return request<AgentResult>('/api/agent/run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
  }, 200000);
}
export function confirmAgentDraft(id: string) {
  return request<{ ticket: Ticket; replayed: boolean }>(`/api/agent/drafts/${encodeURIComponent(id)}/confirm`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
  });
}
