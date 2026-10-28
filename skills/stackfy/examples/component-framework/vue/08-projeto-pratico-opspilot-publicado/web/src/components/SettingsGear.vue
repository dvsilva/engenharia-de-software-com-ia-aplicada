<script setup lang="ts">
import { ref, useId, useTemplateRef, watch, watchEffect } from 'vue';
import { isValidApiBaseUrl } from '../api/config';

const props = defineProps<{ open: boolean; apiBaseUrl: string }>();

const emit = defineEmits<{ open: []; close: []; save: [url: string] }>();

const titleId = useId();
const fieldId = useId();
const errorId = useId();
const draft = ref(props.apiBaseUrl);
const error = ref<string | null>(null);
const field = useTemplateRef<HTMLInputElement>('field');

const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape') emit('close');
};

const save = () => {
  if (!isValidApiBaseUrl(draft.value)) {
    error.value = 'Informe uma URL http(s) válida';
    field.value?.focus();
    return;
  }

  emit('save', draft.value);
  emit('close');
};

watch(
  () => [props.open, props.apiBaseUrl] as const,
  ([open, apiBaseUrl]) => {
    if (!open) return;

    draft.value = apiBaseUrl;
    error.value = null;
  }
);

watch(
  () => props.open,
  (open) => {
    if (open) field.value?.focus();
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
  <button
    type="button"
    class="btn btn--icon"
    aria-label="Configurações"
    @click="emit('open')"
  >
    ⚙
  </button>
  <div
    v-if="open"
    class="drawer-backdrop"
    role="presentation"
    @click="emit('close')"
  >
    <div
      class="settings"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      @click.stop
    >
      <h2 :id="titleId">Configurações</h2>
      <div class="settings__field">
        <label :for="fieldId">URL da API</label>
        <input
          :id="fieldId"
          ref="field"
          v-model="draft"
          :aria-invalid="error ? 'true' : 'false'"
          :aria-describedby="error ? errorId : undefined"
          @input="error = null"
        />
        <p v-if="error" :id="errorId" class="field-error" role="alert">
          {{ error }}
        </p>
      </div>
      <div class="settings__actions">
        <button type="button" class="btn btn--secondary" @click="emit('close')">
          Cancelar
        </button>
        <button type="button" class="btn btn--primary" @click="save">
          Salvar
        </button>
      </div>
    </div>
  </div>
</template>
