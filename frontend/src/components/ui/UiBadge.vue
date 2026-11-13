<script setup>
defineProps({
  variant: {
    type: String,
    default: 'neutral',
    validator: (value) => ['neutral', 'success', 'warning', 'danger', 'info'].includes(value),
  },
})
</script>

<template>
  <span class="badge" :class="variant === 'neutral' ? '' : `badge--${variant}`">
    <slot />
  </span>
</template>
