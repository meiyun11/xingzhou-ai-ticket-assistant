<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { createTicket, fetchTickets, type Ticket, type TicketInput } from './api';
import KnowledgePanel from './KnowledgePanel.vue';
import AgentPanel from './AgentPanel.vue';

function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function emptyForm() {
  return { title: '', environment: '测试' as TicketInput['environment'], occurredAt: localNow(), errorCode: '', reproductionSteps: '' };
}
const form = reactive(emptyForm());
const tickets = ref<Ticket[]>([]);
const loading = ref(false);
const submitting = ref(false);
const listError = ref('');
const formError = ref('');
const successMessage = ref('');
// 同一份表单的失败重试复用键；内容变化时视为新的提交意图。
let pendingRequest: { payload: string; key: string } | null = null;
const openCount = computed(() => tickets.value.filter(ticket => ticket.status === 'open').length);

function errorText(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请检查服务后重试';
}
async function loadTickets() {
  if (loading.value) return;
  loading.value = true;
  listError.value = '';
  try { tickets.value = (await fetchTickets()).items; }
  catch (error) { listError.value = errorText(error); }
  finally { loading.value = false; }
}
async function submit() {
  if (submitting.value || loading.value) return;
  submitting.value = true;
  formError.value = '';
  successMessage.value = '';
  try {
    const date = new Date(form.occurredAt);
    if (!Number.isFinite(date.getTime())) throw new Error('请填写有效的发生时间');
    const input = { ...form, occurredAt: date.toISOString() };
    const payload = JSON.stringify(input);
    if (!pendingRequest || pendingRequest.payload !== payload) {
      pendingRequest = { payload, key: crypto.randomUUID() };
    }
    const { ticket } = await createTicket(input, pendingRequest.key);
    pendingRequest = null;
    successMessage.value = `工单已创建：${ticket.title}（${ticket.id.slice(0, 8)}）`;
    Object.assign(form, emptyForm());
    await loadTickets();
  } catch (error) {
    formError.value = `${errorText(error)}。如果请求超时，请先刷新列表确认是否已创建，再决定是否重试。`;
  } finally { submitting.value = false; }
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(value));
}
onMounted(loadTickets);
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand"><span class="brand-mark">舟</span><strong>星舟</strong><span class="brand-sub">产品支持</span></div>
      <div class="nav-label">工作台</div>
      <div class="nav-current">▤ <span>工单协作</span><span class="nav-dot"></span></div>
      <a class="nav-link" href="http://127.0.0.1:3000/" target="_blank" rel="noopener noreferrer">↗ <span>知识库管理</span></a>
      <div class="aside-note">本地开发环境<br />仅使用演示数据</div>
    </aside>
    <main>
      <header><div><div class="eyebrow">SUPPORT WORKSPACE</div><h1>工单协作台</h1><p>记录问题，保留线索，让每一次排查有据可循。</p></div><span class="environment-pill">本地演示</span></header>
      <section class="stats" aria-label="当前列表概况"><div><span>当前列表</span><strong>{{ tickets.length }}<small>条工单</small></strong></div><div><span>待处理</span><strong>{{ openCount }}<small>条工单</small></strong></div><p>最近 100 条记录 · 时间按北京时间显示</p></section>
      <KnowledgePanel />
      <AgentPanel @created="loadTickets" />
      <div class="workspace-grid">
        <section class="panel form-panel">
          <div class="section-head"><div><h2>创建工单</h2><p>填写必要信息，帮助后续复现与定位。</p></div><span class="step">01</span></div>
          <form @submit.prevent="submit">
            <fieldset :disabled="submitting">
              <label>问题标题<input v-model.trim="form.title" required maxlength="120" placeholder="例如：测试环境登录返回 401" /></label>
              <div class="form-row"><label>发生环境<select v-model="form.environment"><option>开发</option><option>测试</option><option>生产</option></select></label><label>错误码<input v-model.trim="form.errorCode" required maxlength="80" placeholder="例如：401" /></label></div>
              <label>发生时间<input v-model="form.occurredAt" type="datetime-local" required /></label>
              <label>复现步骤<textarea v-model.trim="form.reproductionSteps" required maxlength="4000" rows="4" placeholder="描述操作过程、预期结果与实际表现"></textarea></label>
              <p class="form-hint">请勿填写密码、完整令牌或私钥。</p>
              <button class="primary" type="submit" :disabled="submitting || loading">{{ submitting ? '正在提交…' : '创建工单' }}<span aria-hidden="true">↗</span></button>
            </fieldset>
            <p v-if="formError" class="feedback error" role="alert">{{ formError }}</p>
            <p v-if="successMessage" class="feedback success" role="status">{{ successMessage }}</p>
          </form>
        </section>
        <section class="panel list-panel">
          <div class="section-head"><div><h2>最近工单</h2><p>提交后自动更新，刷新页面仍可查看。</p></div><button class="secondary" :disabled="loading || submitting" @click="loadTickets">{{ loading ? '加载中…' : '刷新列表' }}</button></div>
          <p v-if="listError" class="feedback error" role="alert">{{ listError }}，请检查后端服务并刷新。</p>
          <p v-if="loading" class="empty" role="status">正在读取工单…</p>
          <p v-else-if="!tickets.length && !listError" class="empty">还没有工单，从左侧记录第一个问题。</p>
          <ul v-else class="ticket-list">
            <li v-for="ticket in tickets" :key="ticket.id" class="ticket">
              <div class="ticket-top"><span class="ticket-id">#{{ ticket.id.slice(0, 8) }}</span><span class="status" :class="ticket.status">{{ ticket.status === 'open' ? '待处理' : '已关闭' }}</span></div>
              <h3>{{ ticket.title }}</h3>
              <div class="ticket-meta"><span>{{ ticket.environment }}环境</span><span>错误 {{ ticket.errorCode }}</span><span>{{ formatTime(ticket.occurredAt) }}</span></div>
              <details><summary>查看复现步骤</summary><p class="steps">{{ ticket.reproductionSteps }}</p><p class="created">创建于 {{ formatTime(ticket.createdAt) }}</p></details>
            </li>
          </ul>
        </section>
      </div>
      <footer>星舟协作平台 · 个人项目演示</footer>
    </main>
  </div>
</template>
