<script setup>
import { useAttrs, useId } from 'vue'

defineOptions({ inheritAttrs: false })

defineProps({
  modelValue: { type: [String, Number], default: '' },
  id: { type: String, default: undefined },
  type: { type: String, default: 'text' },
  invalid: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const attrs = useAttrs()
const generatedId = useId()
</script>

<template>
  <span
    class="input-control"
    :class="{
      'input-control--leading': $slots.leading,
      'input-control--trailing': $slots.trailing,
    }"
  >
    <span
      v-if="$slots.leading"
      class="input-control__icon input-control__icon--leading"
      aria-hidden="true"
    >
      <slot name="leading" />
    </span>
    <input
      :id="id || `input-${generatedId}`"
      v-bind="attrs"
      class="input"
      :type="type"
      :value="modelValue"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="
        emit(
          'update:modelValue',
          type === 'number' && $event.target.value !== ''
            ? Number($event.target.value)
            : $event.target.value,
        )
      "
    />
    <span
      v-if="$slots.trailing"
      class="input-control__icon input-control__icon--trailing"
      aria-hidden="true"
    >
      <slot name="trailing" />
    </span>
  </span>
</template>
