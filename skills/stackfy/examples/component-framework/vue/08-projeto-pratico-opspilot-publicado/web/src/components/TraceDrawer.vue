<script setup lang="ts">
import { useId, useTemplateRef, watch, watchEffect } from 'vue';
import type { TraceEventView } from '../api/types';
import EmptyState from './EmptyState.vue';

const props = defineProps<{ open: boolean; events: TraceEventView[] }>();

const emit = defineEmits<{ close: [] }>();

const titleId = useId();
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');

const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};

watch(
  () => props.open,
  (open) => {
    if (open) closeButton.value?.focus();
  },
  { flush: 'post' }
);

watchEffect((onCleanup) => {
  if (!props.open) return;

  window.addEventListener('keydown', closeOnEscape);
  onCleanup(() => window.removeEventListener('keydown', closeOnEscape));
});
</script>

<template>
  <div
    v-if="open"
    class="drawer-backdrop"
    role="presentation"
    @click="emit('close')"
  >
    <div
      class="drawer"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @click.stop
    >
      <header class="drawer__header">
        <h2 :id="titleId">Raciocínio</h2>
        <button
          ref="closeButton"
          type="button"
          class="btn btn--ghost"
          aria-label="Fechar raciocínio"
          @click="emit('close')"
        >
          Fechar
        </button>
      </header>
      <EmptyState
        v-if="events.length === 0"
        title="Sem eventos de raciocínio"
        message="Este turno não trouxe eventos de trace."
        action-label="Fechar"
        @action="emit('close')"
      />
      <ol v-else class="trace-list">
        <li
          v-for="(event, index) in events"
          :key="`${event.type}-${index}`"
          class="trace-item"
        >
          <div class="trace-item__type">{{ event.type }}</div>
          <div class="trace-item__content">{{ event.content }}</div>
          <div class="trace-item__node">nó: {{ event.node }}</div>
          <div v-if="event.tool" class="trace-item__node">
            tool: {{ event.tool }}
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
