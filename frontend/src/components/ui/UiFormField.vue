<script setup>
import { computed, useId } from 'vue'
import UiLabel from './UiLabel.vue'

const props = defineProps({
  label: { type: String, required: true },
  id: { type: String, default: undefined },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
  required: { type: Boolean, default: false },
})

const generatedId = useId()
const fieldId = computed(() => props.id || `field-${generatedId}`)
const hintId = computed(() => `${fieldId.value}-hint`)
const errorId = computed(() => `${fieldId.value}-error`)
const describedBy = computed(
  () =>
    [props.hint && hintId.value, props.error && errorId.value].filter(Boolean).join(' ') ||
    undefined,
)
</script>

<template>
  <div class="form-field">
    <UiLabel :html-for="fieldId" :required="required">{{ label }}</UiLabel>
    <slot
      :id="fieldId"
      :described-by="describedBy"
      :invalid="Boolean(error)"
      :required="required"
    />
    <p v-if="hint" :id="hintId" class="field__hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="field__error" role="alert">{{ error }}</p>
  </div>
</template>
