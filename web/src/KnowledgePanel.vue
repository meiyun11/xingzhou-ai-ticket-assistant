<script setup lang="ts">
import { computed, ref } from 'vue';
import { askKnowledge, type KnowledgeAnswer } from './api';

const question = ref('access_token 的有效期是多久？');
const submittedQuestion = ref('');
const busy = ref(false);
const error = ref('');
const result = ref<KnowledgeAnswer | null>(null);
const answerParts = computed(() => (result.value?.answer || '').split(/(\*\*[^*\n]+\*\*)/g).map(text => ({
  bold: text.startsWith('**') && text.endsWith('**') && text.length > 4,
  text: text.startsWith('**') && text.endsWith('**') && text.length > 4 ? text.slice(2, -2) : text,
})));
async function ask() {
  if (busy.value || !question.value.trim()) return;
  busy.value = true;
  error.value = '';
  result.value = null;
  submittedQuestion.value = question.value.trim();
  try { result.value = await askKnowledge(submittedQuestion.value); }
  catch (failure) { error.value = failure instanceof Error ? failure.message : '问答请求失败'; }
  finally { busy.value = false; }
}
</script>

<template>
  <section class="panel knowledge-panel">
    <div class="section-head"><div><h2>知识问答</h2><p>查询当前知识空间，展开来源核对回答依据。</p></div><span class="knowledge-badge">知识库</span></div>
    <form class="question-form" @submit.prevent="ask">
      <label>你的问题<input v-model="question" :disabled="busy" required maxlength="2000" placeholder="输入产品或故障处理问题" /></label>
      <button class="primary" type="submit" :disabled="busy || !question.trim()">{{ busy ? '正在检索与回答…' : '查询知识库' }}</button>
    </form>
    <p v-if="busy" class="knowledge-wait" role="status">正在查询，请等待本次请求完成。</p>
    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <div v-if="result" class="knowledge-result" aria-live="polite">
      <p class="asked-question">问题：{{ submittedQuestion }}</p>
      <div class="answer-text"><template v-for="(part, index) in answerParts" :key="index"><strong v-if="part.bold">{{ part.text }}</strong><span v-else>{{ part.text }}</span></template></div>
      <h3>来源片段 · {{ result.sources.length }} 条</h3>
      <p v-if="!result.sources.length" class="form-hint">本次接口未返回来源片段，请核对知识库是否包含相关资料。</p>
      <details v-for="source in result.sources" :key="source.id" class="knowledge-source">
        <summary>{{ source.id }}. {{ source.title }}</summary>
        <p class="steps">{{ source.snippet || '接口未提供可显示的来源正文。' }}</p>
        <p v-if="source.truncated" class="form-hint">片段较长，此处展示前 10000 个字符。</p>
      </details>
    </div>
  </section>
</template>
