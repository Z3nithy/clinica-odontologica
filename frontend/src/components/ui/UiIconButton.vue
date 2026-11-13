<script setup>
defineProps({
  label: {
    type: String,
    required: true,
  },
  controls: {
    type: String,
    default: undefined,
  },
  expanded: {
    type: Boolean,
    default: undefined,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
})
</script>

<template>
  <button
    class="icon-button"
    type="button"
    :aria-label="label"
    :aria-controls="controls"
    :aria-expanded="expanded"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>
