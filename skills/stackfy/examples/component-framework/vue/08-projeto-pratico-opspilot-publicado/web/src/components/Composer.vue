<script setup lang="ts">
import { computed, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{ disabled?: boolean; sending?: boolean }>(),
  { disabled: false, sending: false }
);

const awaitHumanApproval = defineModel<boolean>('awaitHumanApproval', {
  required: true,
});

const emit = defineEmits<{ send: [message: string]; abort: [] }>();

const draft = ref('');
const fieldId = useId();
const toggleId = useId();
const locked = computed(() => props.disabled || props.sending);

const submit = () => {
  const message = draft.value.trim();
  if (!message || locked.value) return;

  emit('send', message);
  draft.value = '';
};

const submitOnEnter = (event: KeyboardEvent) => {
  if (event.key !== 'Enter' || event.shiftKey) return;

  event.preventDefault();
  submit();
};
</script>

<template>
  <form class="composer" @submit.prevent="submit">
    <div class="composer__field">
      <label :for="fieldId">Mensagem</label>
      <textarea
        :id="fieldId"
        v-model="draft"
        rows="3"
        :disabled="locked"
        placeholder="Descreva o incidente ou peça ajuda ao OpsPilot…"
        @keydown="submitOnEnter"
      />
    </div>
    <div class="composer__row">
      <label class="composer__toggle" :for="toggleId"
        ><input
          :id="toggleId"
          v-model="awaitHumanApproval"
          type="checkbox"
          :disabled="locked"
        />Exigir aprovação</label
      >
      <div class="composer__actions">
        <button
          v-if="sending"
          type="button"
          class="btn btn--secondary"
          @click="emit('abort')"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="btn btn--primary"
          :disabled="locked || !draft.trim()"
        >
          {{ sending ? 'Enviando…' : 'Enviar' }}
        </button>
      </div>
    </div>
  </form>
</template>
