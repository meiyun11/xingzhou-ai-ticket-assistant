import { readFileSync, writeFileSync } from 'node:fs';
import { callAgentModel } from './agent-model.js';
import { visibleAnswer } from './knowledge.js';

// 凭据仅从管道输入读取，不作为命令行参数，也不写入日志。
let input = '';
for await (const chunk of process.stdin) input += chunk;
try {
  const { key, model } = JSON.parse(input);
  input = '';
  if (typeof key !== 'string' || !key || /[\s"'<>#]/.test(key) || key.startsWith('Bearer ')) throw new Error('Paste the raw SiliconFlow Key without spaces or quotes.');
  if (typeof model !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(model)) throw new Error('Invalid model ID format.');
  const tools = [{ type: 'function', function: {
    name: 'probe_connection',
    description: 'Verify a local demo tool connection. This tool has no business side effects.',
    parameters: { type: 'object', properties: { code: { type: 'string', enum: ['local-check'] } }, required: ['code'], additionalProperties: false },
  } }];
  const messages = [
    { role: 'system', content: 'For this connectivity test, call probe_connection with code local-check. After receiving its result, reply exactly TOOL_LOOP_OK. Never invent the tool result.' },
    { role: 'user', content: 'Verify the local tool connection using the provided tool.' },
  ];
  const getConfig = () => ({ key, model });
  const reply = await callAgentModel({ messages, tools }, { getConfig });
  const calls = reply.tool_calls;
  if (!Array.isArray(calls) || calls.length !== 1) throw new Error('No single structured tool call received. Tool support is not verified; no configuration saved.');
  const call = calls[0];
  if (call.type !== 'function' || call.function?.name !== 'probe_connection' || typeof call.id !== 'string' || !call.id) throw new Error('Unexpected tool call; no tool executed.');
  let args;
  try { args = JSON.parse(call.function.arguments); }
  catch { throw new Error('Tool arguments are not valid JSON.'); }
  if (!args || args.code !== 'local-check' || Object.keys(args).length !== 1) throw new Error('Tool argument validation failed.');
  console.log('TOOL_CALL: PASS (structured probe_connection call received)');
  console.log('ARGUMENTS: PASS');
  // 这里只执行白名单里的本地演示函数，不执行模型输出的任意代码。
  const toolResult = { status: 'ok', verification: 'TOOL_LOOP_OK' };
  messages.push(reply, { role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
  const finalReply = await callAgentModel({ messages, tools, toolChoice: 'none' }, { getConfig });
  if (!visibleAnswer(typeof finalReply.content === 'string' ? finalReply.content : '').includes('TOOL_LOOP_OK')) {
    throw new Error('Tool result round trip was not confirmed. No configuration saved.');
  }
  console.log('TOOL_LOOP: PASS (tool result accepted by model)');
  const envPath = new URL('../.env', import.meta.url);
  let env = '';
  try { env = readFileSync(envPath, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read existing local configuration.'); }
  for (const [name, value] of Object.entries({ AGENT_MODEL_API_KEY: key, AGENT_MODEL: model })) {
    env = env.replace(new RegExp(`^${name}=.*\\r?\\n?`, 'gm'), '');
    env += `\n${name}=${value}\n`;
  }
  writeFileSync(envPath, env, 'utf8');
  console.log('AGENT_CONFIG: PASS (backend .env saved; existing RAG settings preserved)');
} catch (error) {
  // 只输出我们自己定义的错误，避免 SDK/网络异常包含请求凭据。
  const message = error instanceof SyntaxError ? 'Invalid setup input or tool arguments.' : error.message;
  console.error('PROBE: FAIL - ' + message);
  process.exitCode = 1;
}
