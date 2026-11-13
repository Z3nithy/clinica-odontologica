<script setup>
import { computed } from 'vue'

const props = defineProps({
  href: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    default: 'button',
    validator: (value) => ['button', 'submit', 'reset'].includes(value),
  },
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'tertiary', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  loading: {
    type: Boolean,
    default: false,
  },
})

const isDisabled = computed(() => props.disabled || props.loading)
const buttonClasses = computed(() => [
  'button',
  `button--${props.variant}`,
  props.size !== 'md' && `button--${props.size}`,
])
</script>

<template>
  <a
    v-if="href && !isDisabled"
    :href="href"
    :class="buttonClasses"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span v-if="loading" class="button__spinner" aria-hidden="true"></span>
    <span v-if="loading" class="visually-hidden">Carregando</span>
    <span v-if="$slots.start" class="button__icon" aria-hidden="true"><slot name="start" /></span>
    <slot />
    <span v-if="$slots.end" class="button__icon" aria-hidden="true"><slot name="end" /></span>
  </a>
  <button
    v-else
    :type="type"
    :class="buttonClasses"
    :disabled="isDisabled"
    :aria-busy="loading ? 'true' : undefined"
  >
    <span v-if="loading" class="button__spinner" aria-hidden="true"></span>
    <span v-if="loading" class="visually-hidden">Carregando</span>
    <span v-if="$slots.start" class="button__icon" aria-hidden="true"><slot name="start" /></span>
    <slot />
    <span v-if="$slots.end" class="button__icon" aria-hidden="true"><slot name="end" /></span>
  </button>
</template>
