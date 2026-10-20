import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

export class KnowledgeError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function visibleAnswer(text) {
  const pattern = /<\/?think\b[^>]*>/gi;
  let depth = 0;
  let position = 0;
  let visible = '';
  for (const match of text.matchAll(pattern)) {
    if (depth === 0) visible += text.slice(position, match.index);
    if (/^<\//.test(match[0])) {
      // 孤立闭合标记可能来自上游省略了开头的内容，舍弃此前文字。
      if (depth === 0) visible = '';
      else depth--;
    } else depth++;
    position = match.index + match[0].length;
  }
  if (depth === 0) visible += text.slice(position);
  return visible.trim();
}

function loadConfig() {
  let config;
  try { config = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')); }
  catch { throw new KnowledgeError('知识库尚未配置，请先运行本机配置脚本', 503); }
  if (!config.ANYTHINGLLM_API_KEY || !config.ANYTHINGLLM_WORKSPACE) {
    throw new KnowledgeError('知识库配置不完整，请重新运行本机配置脚本', 503);
  }
  return {
    baseUrl: config.ANYTHINGLLM_BASE_URL || 'http://127.0.0.1:3001/api/v1',
    key: config.ANYTHINGLLM_API_KEY,
    workspace: config.ANYTHINGLLM_WORKSPACE,
  };
}

export async function answerKnowledge(question, { getConfig = loadConfig, fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  if (typeof question !== 'string' || !question.trim() || question.trim().length > 2000) {
    throw new KnowledgeError('问题必须为 1–2000 个字符', 400);
  }
  const config = getConfig();
  let response;
  try {
    response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/workspace/${encodeURIComponent(config.workspace)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({ message: question.trim(), mode: 'query' }),
      signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new KnowledgeError('知识库回答超时，请稍后重试', 504);
    throw new KnowledgeError('无法连接知识库服务，请检查 AnythingLLM 是否运行');
  }
  if (!response.ok) {
    if (response.status === 403 || response.status === 401) throw new KnowledgeError('AnythingLLM 开发者 Key 未通过认证，请检查本机配置');
    throw new KnowledgeError(`知识库接口请求失败（HTTP ${response.status}），请检查服务和工作空间配置`);
  }
  let result;
  try { result = await response.json(); }
  catch { throw new KnowledgeError('知识库返回了无法解析的响应'); }
  if (!result || result.type === 'abort' || result.error || typeof result.textResponse !== 'string' || !result.textResponse.trim()) {
    throw new KnowledgeError('知识库未能生成回答，请检查 AnythingLLM 中的模型、额度与文档索引状态');
  }
  const answer = visibleAnswer(result.textResponse);
  if (!answer) throw new KnowledgeError('模型未返回可显示的最终答案，请重试或检查模型输出设置');
  const sources = (Array.isArray(result.sources) ? result.sources : []).slice(0, 10)
    .filter(source => source && typeof source === 'object')
    .map((source, index) => {
      const snippet = [source.chunk, source.text, source.pageContent].find(value => typeof value === 'string') || '';
      return {
        id: index + 1,
        title: typeof source.title === 'string' ? source.title.slice(0, 300) : '未命名来源',
        snippet: snippet.slice(0, 10000),
        truncated: snippet.length > 10000,
      };
    });
  return { answer, sources, mode: 'query' };
}
