<script setup lang="ts">
import type { DecisionStatus } from './types';

withDefaults(
  defineProps<{
    summary: string;
    status: DecisionStatus;
    errorMessage?: string | null;
    busy?: boolean;
  }>(),
  { errorMessage: null, busy: false }
);

const emit = defineEmits<{ approve: []; deny: [] }>();

const OUTCOMES = {
  pending: '',
  approved: 'Aprovado',
  denied: 'Negado',
  error: 'Erro na decisão',
} satisfies Record<DecisionStatus, string>;
</script>

<template>
  <section class="approval-card" aria-label="Ação pendente">
    <h2>Ação pendente</h2>
    <p>{{ summary }}</p>
    <div v-if="status === 'pending'" class="approval-card__actions">
      <button
        type="button"
        class="btn btn--primary"
        :disabled="busy"
        @click="emit('approve')"
      >
        Aprovar
      </button>
      <button
        type="button"
        class="btn btn--danger"
        :disabled="busy"
        @click="emit('deny')"
      >
        Negar
      </button>
    </div>
    <p v-else class="approval-card__status" role="status">
      {{ OUTCOMES[status] }}
    </p>
    <div v-if="errorMessage" class="banner banner--danger" role="alert">
      {{ errorMessage }}
    </div>
  </section>
</template>
