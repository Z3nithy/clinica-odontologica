<script setup>
defineProps({
  htmlFor: { type: String, default: undefined },
  required: { type: Boolean, default: false },
})
</script>

<template>
  <label class="ui-label" :for="htmlFor">
    <slot />
    <span v-if="required" class="ui-label__required" aria-hidden="true">*</span>
  </label>
</template>
