<script setup>
import { useId } from 'vue'

defineProps({
  content: { type: String, required: true },
  placement: {
    type: String,
    default: 'top',
    validator: (value) => ['top', 'bottom'].includes(value),
  },
})
const id = useId()
</script>

<template>
  <span class="tooltip-host">
    <span class="tooltip-trigger"><slot :described-by="id" /></span>
    <span :id="id" class="tooltip" role="tooltip" :class="`tooltip--${placement}`">
      {{ content }}
    </span>
  </span>
</template>
