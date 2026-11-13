<script setup>
import { useAttrs, useId } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps({
  modelValue: { type: String, default: '' },
  id: { type: String, default: undefined },
  rows: { type: Number, default: 4 },
  invalid: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const attrs = useAttrs()
const generatedId = useId()
</script>

<template>
  <textarea
    :id="id || `textarea-${generatedId}`"
    v-bind="attrs"
    class="textarea"
    :rows="rows"
    :value="modelValue"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', $event.target.value)"
  ></textarea>
</template>
