<script setup lang="ts">
defineProps<{ title: string; message: string; actionLabel?: string }>();

const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div class="empty-state" role="status">
    <h2 class="empty-state__title">{{ title }}</h2>
    <p class="empty-state__message">{{ message }}</p>
    <button
      v-if="actionLabel"
      type="button"
      class="btn btn--secondary"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
