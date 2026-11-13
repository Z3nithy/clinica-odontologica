<script setup>
import { computed } from 'vue'

const props = defineProps({
  variant: {
    type: String,
    default: 'info',
    validator: (value) => ['info', 'success', 'warning', 'danger'].includes(value),
  },
  title: { type: String, default: '' },
  live: { type: Boolean, default: false },
})
const role = computed(() =>
  props.variant === 'danger' ? 'alert' : props.live ? 'status' : undefined,
)
</script>

<template>
  <div class="alert" :class="`alert--${variant}`" :role="role">
    <span v-if="$slots.icon" class="alert__icon" aria-hidden="true"><slot name="icon" /></span>
    <div>
      <p v-if="title" class="alert__title">{{ title }}</p>
      <slot />
    </div>
  </div>
</template>
