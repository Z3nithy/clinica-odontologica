<script setup>
defineProps({
  label: { type: String, default: 'Carregando' },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
})
</script>

<template>
  <span class="spinner" :class="`spinner--${size}`" role="status">
    <span class="visually-hidden">{{ label }}</span>
  </span>
</template>
