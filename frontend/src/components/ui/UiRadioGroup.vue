<script setup>
import { useId } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  label: { type: String, required: true },
  name: { type: String, default: undefined },
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
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const generatedId = useId()
const groupName = props.name || `radio-${generatedId}`
</script>

<template>
  <fieldset class="radio-group" :disabled="disabled">
    <legend class="ui-label">{{ label }}</legend>
    <label v-for="option in options" :key="option.value" class="choice">
      <input
        type="radio"
        :name="groupName"
        :value="option.value"
        :checked="modelValue === option.value"
        :disabled="option.disabled"
        @change="emit('update:modelValue', option.value)"
      />
      <span>{{ option.label }}</span>
    </label>
  </fieldset>
</template>
