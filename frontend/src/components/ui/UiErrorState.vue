<script setup>
defineProps({
  title: { type: String, default: 'Não foi possível carregar este conteúdo' },
  description: { type: String, default: 'Tente novamente em alguns instantes.' },
})
defineEmits(['retry'])
</script>

<template>
  <section class="error-state" role="alert">
    <slot name="icon" />
    <h3 class="empty-state__title">{{ title }}</h3>
    <p>{{ description }}</p>
    <button class="button button--secondary" type="button" @click="$emit('retry')">
      Tentar novamente
    </button>
  </section>
</template>
