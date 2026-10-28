<script setup lang="ts">
import EmptyState from './EmptyState.vue';
import type { ChatTurnView } from './types';

defineProps<{ turns: ChatTurnView[]; canRetry: boolean }>();

const emit = defineEmits<{ viewReasoning: [turnId: string]; retry: [] }>();

const AUTHORS = {
  user: 'Você',
  assistant: 'OpsPilot',
  system: 'Sistema',
} satisfies Record<ChatTurnView['role'], string>;

const hasReasoning = (turn: ChatTurnView) =>
  turn.role === 'assistant' && (turn.trace?.length ?? 0) > 0;
</script>

<template>
  <EmptyState
    v-if="turns.length === 0"
    title="Nenhuma mensagem ainda"
    message="Envie a primeira mensagem para começar o plantão na War Room."
  />
  <ol v-else class="thread" aria-live="polite">
    <li
      v-for="turn in turns"
      :key="turn.id"
      :class="['bubble', `bubble--${turn.role}`]"
    >
      <div class="bubble__meta">{{ AUTHORS[turn.role] }}</div>
      <div class="bubble__content">{{ turn.content }}</div>
      <div v-if="turn.errorMessage" class="banner banner--danger" role="alert">
        <strong>Erro</strong>
        <p>{{ turn.errorMessage }}</p>
        <button
          v-if="canRetry"
          type="button"
          class="btn btn--secondary"
          @click="emit('retry')"
        >
          Tentar de novo
        </button>
      </div>
      <button
        v-if="hasReasoning(turn)"
        type="button"
        class="btn btn--ghost"
        @click="emit('viewReasoning', turn.id)"
      >
        Ver raciocínio
      </button>
    </li>
  </ol>
</template>
