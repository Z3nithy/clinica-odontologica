<script setup>
import { useAttrs, useId } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  id: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const attrs = useAttrs()
const generatedId = useId()
</script>

<template>
  <label class="choice" :for="id || `checkbox-${generatedId}`">
    <input
      :id="id || `checkbox-${generatedId}`"
      v-bind="attrs"
      type="checkbox"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', $event.target.checked)"
    />
    <span>{{ label }}</span>
  </label>
</template>
