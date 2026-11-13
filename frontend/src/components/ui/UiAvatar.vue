<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  src: { type: String, default: '' },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
})

const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join(''),
)
</script>

<template>
  <span class="avatar" :class="`avatar--${size}`" role="img" :aria-label="name">
    <img v-if="src" :src="src" alt="" class="avatar__image" />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>
