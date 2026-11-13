<script setup>
import { useAttrs, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

defineOptions({ inheritAttrs: false })

defineProps({
  modelValue: { type: [String, Number], default: '' },
  id: { type: String, default: undefined },
  options: {
    type: Array,
    required: true,
    validator: (items) =>
      Array.isArray(items) &&
      items.every(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          typeof item.label === 'string' &&
          'value' in item,
      ),
  },
  placeholder: { type: String, default: 'Selecione uma opção' },
  invalid: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const attrs = useAttrs()
const generatedId = useId()
</script>

<template>
  <span class="select-control">
    <select
      :id="id || `select-${generatedId}`"
      v-bind="attrs"
      class="select"
      :value="modelValue"
      :aria-invalid="invalid ? 'true' : undefined"
      @change="
        emit(
          'update:modelValue',
          options.find((option) => String(option.value) === $event.target.value)?.value ?? '',
        )
      "
    >
      <option value="" disabled>{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <span class="select-control__icon" aria-hidden="true">
      <slot name="icon"><ChevronDown :size="16" /></slot>
    </span>
  </span>
</template>
