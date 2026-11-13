<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<template>
  <section class="empty-state" aria-live="polite">
    <slot name="icon" />
    <h3 class="empty-state__title">{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </section>
</template>
