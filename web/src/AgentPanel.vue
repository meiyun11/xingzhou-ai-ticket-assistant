<script setup lang="ts">
import { ref } from 'vue';
import { runAgentTask, confirmAgentDraft, type AgentResult } from './api';
const emit = defineEmits<{ created: [] }>();
const task = ref('测试环境登录返回401。发生时间：2026-10-20T12:00:00+08:00。复现步骤：打开登录页，使用虚构测试凭据提交后返回401。请查询处理规范和已有工单，为我准备排障工单草稿，先不要创建。');
const busy = ref(false);
const confirming = ref(false);
const error = ref('');
const result = ref<AgentResult | null>(null);
const createdId = ref('');
const cancelled = ref(false);
async function run() {
  if (busy.value || confirming.value) return;
  busy.value = true; error.value = ''; result.value = null; createdId.value = ''; cancelled.value = false;
  try { result.value = await runAgentTask(task.value); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '任务执行失败'; }
  finally { busy.value = false; }
}
async function confirm() {
  if (!result.value?.draft || confirming.value || createdId.value || cancelled.value) return;
  confirming.value = true; error.value = '';
  try {
    const response = await confirmAgentDraft(result.value.draft.id);
    createdId.value = response.ticket.id;
    emit('created');
  } catch (failure) { error.value = failure instanceof Error ? failure.message : '确认失败，可使用同一草稿重试'; }
  finally { confirming.value = false; }
}
</script>

<template>
  <section class="panel knowledge-panel agent-panel">
    <div class="section-head"><div><h2>Agent 工单助手</h2><p>查询规范与已有工单，生成草稿供你审核。</p></div><span class="knowledge-badge">工具调用</span></div>
    <form @submit.prevent="run"><label>描述你的任务<textarea v-model="task" rows="3" required maxlength="4000" :disabled="busy || confirming" /></label><button class="primary agent-run" :disabled="busy || confirming || !task.trim()">{{ busy ? '正在执行任务…' : '运行助手' }}</button></form>
    <p v-if="busy" class="knowledge-wait" role="status">正在调用模型和工具，完成后展示执行记录。请勿重复提交。</p>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <div v-if="result" class="knowledge-result">
      <div class="answer-text">{{ result.answer }}</div>
      <h3>工具执行记录</h3>
      <ol class="agent-trace"><li v-for="(step, index) in result.trace" :key="index"><code>{{ step.tool }}</code><span :class="step.status === 'success' ? 'trace-ok' : 'trace-error'">{{ step.status === 'success' ? '成功' : '失败' }}</span><small>{{ step.durationMs }} ms</small><p>{{ step.summary }}</p></li></ol>
      <div v-if="result.relatedTotal" class="duplicate-note"><strong>已发现 {{ result.relatedTotal }} 条同环境、同错误码的未关闭工单</strong><p>请先核对已有问题，再决定是否新增。</p><ul><li v-for="ticket in result.relatedTickets" :key="ticket.id">#{{ ticket.id.slice(0, 8) }} · {{ ticket.title }}</li></ul></div>
      <details v-for="source in result.sources" :key="source.id" class="knowledge-source"><summary>依据：{{ source.title }}</summary><p class="steps">{{ source.snippet }}</p></details>
      <div v-if="result.draft" class="draft-card">
        <h3>工单草稿 <span class="draft-label">{{ createdId ? '已创建' : '尚未创建' }}</span></h3>
        <dl><dt>标题</dt><dd>{{ result.draft.title }}</dd><dt>环境 / 错误码</dt><dd>{{ result.draft.environment }} / {{ result.draft.errorCode }}</dd><dt>发生时间</dt><dd>{{ result.draft.occurredAt }}</dd><dt>复现步骤</dt><dd class="steps">{{ result.draft.reproductionSteps }}</dd></dl>
        <p v-if="createdId" class="feedback success" role="status">已创建工单：{{ createdId }}</p>
        <p v-else-if="cancelled" class="form-hint">本页已取消创建，没有提交确认请求。</p>
        <div v-else class="draft-actions"><button class="primary" :disabled="confirming" @click="confirm">{{ confirming ? '正在确认…' : '确认创建工单' }}</button><button class="secondary" :disabled="confirming" @click="cancelled = true">暂不创建</button></div>
      </div>
    </div>
  </section>
</template>
