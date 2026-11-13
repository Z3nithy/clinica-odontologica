<script setup>
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <label class="switch-field">
    <button
      class="toggle"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :disabled="disabled"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="visually-hidden">{{ label }}</span>
    </button>
    <span>{{ label }}</span>
  </label>
</template>
