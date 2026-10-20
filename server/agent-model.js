import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function readAgentConfig() {
  let env;
  try { env = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')); }
  catch { throw new Error('Agent model configuration is missing.'); }
  if (!env.AGENT_MODEL_API_KEY || !env.AGENT_MODEL) throw new Error('Run the Agent tool verification setup first.');
  return { key: env.AGENT_MODEL_API_KEY, model: env.AGENT_MODEL };
}

export async function callAgentModel({ messages, tools, toolChoice = 'auto' }, { getConfig = readAgentConfig, fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  const { key, model } = getConfig();
  let response;
  try {
    response = await fetchImpl('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: toolChoice, max_tokens: 2048, stream: false }),
      signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
    });
  } catch { throw new Error('Agent model request failed: network or timeout.'); }
  if (!response.ok) throw new Error(`Agent model HTTP ${response.status}. Check credentials, balance, model ID or tool support.`);
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Agent model returned invalid JSON.'); }
  const message = result?.choices?.[0]?.message;
  if (!message || message.role !== 'assistant') throw new Error('Agent model returned no assistant message.');
  return message;
}
