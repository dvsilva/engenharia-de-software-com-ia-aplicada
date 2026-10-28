<script setup lang="ts">
import { computed, ref } from 'vue';
import { ApiClientError, isAbort, postApproval, postChat } from './api/client';
import { loadApiBaseUrl, saveApiBaseUrl } from './api/config';
import type { ApprovalSuccess } from './api/types';
import ApprovalCard from './components/ApprovalCard.vue';
import ChatThread from './components/ChatThread.vue';
import Composer from './components/Composer.vue';
import SettingsGear from './components/SettingsGear.vue';
import TraceDrawer from './components/TraceDrawer.vue';
import type { ChatTurnView, PendingApproval } from './components/types';
import './app.css';

const apiBaseUrl = ref(loadApiBaseUrl());
const settingsOpen = ref(false);
const turns = ref<ChatTurnView[]>([]);
const conversationId = ref<string | null>(null);
const awaitHumanApproval = ref(false);
const sending = ref(false);
const pending = ref<PendingApproval | null>(null);
const traceTurnId = ref<string | null>(null);
const lastFailedMessage = ref<string | null>(null);
let controller: AbortController | null = null;

const blocked = computed(() => pending.value?.status === 'pending');
const traceEvents = computed(
  () => turns.value.find((turn) => turn.id === traceTurnId.value)?.trace ?? []
);

const failureMessage = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error.message : fallback;

const keepConversation = (id: string | null) => {
  if (id) conversationId.value = id;
};

const finishAssistant = (data: ApprovalSuccess) => {
  keepConversation(data.conversationId);
  turns.value = [
    ...turns.value,
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: data.answer,
      requestId: data.requestId,
      trace: data.trace,
    },
  ];
};

const sendMessage = async (message: string) => {
  lastFailedMessage.value = null;
  turns.value = [
    ...turns.value.filter((turn) => turn.role !== 'system'),
    { id: crypto.randomUUID(), role: 'user', content: message },
  ];
  sending.value = true;
  controller = new AbortController();

  try {
    const result = await postChat({
      baseUrl: apiBaseUrl.value,
      message,
      conversationId: conversationId.value,
      awaitHumanApproval: awaitHumanApproval.value,
      signal: controller.signal,
    });

    if (result.kind === 'success') {
      finishAssistant(result.data);
      return;
    }

    keepConversation(result.data.conversationId);
    pending.value = {
      approvalId: result.data.pending.approvalId,
      summary: result.data.pending.summary,
      status: 'pending',
      errorMessage: null,
    };
  } catch (error) {
    if (isAbort(error)) return;

    lastFailedMessage.value = message;
    turns.value = [
      ...turns.value,
      {
        id: crypto.randomUUID(),
        role: 'system',
        content: '',
        errorMessage: failureMessage(error, 'Não foi possível falar com a API'),
      },
    ];
  } finally {
    sending.value = false;
    controller = null;
  }
};

const decide = async (decision: 'approve' | 'deny') => {
  const held = pending.value;
  if (held?.status !== 'pending') return;

  sending.value = true;

  try {
    const data = await postApproval({
      baseUrl: apiBaseUrl.value,
      approvalId: held.approvalId,
      decision,
    });

    pending.value = {
      ...held,
      status: decision === 'approve' ? 'approved' : 'denied',
      errorMessage: null,
    };
    finishAssistant(data);
  } catch (error) {
    pending.value = {
      ...held,
      status: 'error',
      errorMessage: failureMessage(error, 'Falha ao enviar decisão'),
    };
  } finally {
    sending.value = false;
  }
};

const retry = () => {
  if (lastFailedMessage.value) void sendMessage(lastFailedMessage.value);
};

const abort = () => controller?.abort();

const saveSettings = (url: string) => {
  apiBaseUrl.value = saveApiBaseUrl(url);
};
</script>

<template>
  <div class="war-room">
    <header class="war-room__header">
      <div>
        <p class="eyebrow">Plantão</p>
        <h1>OpsPilot</h1>
        <p class="lede">
          War Room — chat operacional com raciocínio auditável.
        </p>
      </div>
      <SettingsGear
        :open="settingsOpen"
        :api-base-url="apiBaseUrl"
        @open="settingsOpen = true"
        @close="settingsOpen = false"
        @save="saveSettings"
      />
    </header>

    <main class="war-room__main">
      <ChatThread
        :turns="turns"
        :can-retry="lastFailedMessage !== null"
        @view-reasoning="traceTurnId = $event"
        @retry="retry"
      />
      <ApprovalCard
        v-if="pending"
        :summary="pending.summary"
        :status="pending.status"
        :error-message="pending.errorMessage"
        :busy="sending"
        @approve="decide('approve')"
        @deny="decide('deny')"
      />
      <Composer
        v-model:await-human-approval="awaitHumanApproval"
        :disabled="blocked"
        :sending="sending"
        @send="sendMessage"
        @abort="abort"
      />
    </main>

    <TraceDrawer
      :open="traceTurnId !== null"
      :events="traceEvents"
      @close="traceTurnId = null"
    />
  </div>
</template>
