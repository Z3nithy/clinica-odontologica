<script setup>
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

defineProps({
  label: { type: String, required: true },
  items: {
    type: Array,
    required: true,
    validator: (items) =>
      Array.isArray(items) &&
      items.every((item) => typeof item.id === 'string' && typeof item.label === 'string'),
  },
})
const emit = defineEmits(['select'])
const menu = ref(null)

function selectItem(item) {
  if (item.disabled) return
  emit('select', item)
  menu.value?.removeAttribute('open')
}
</script>

<template>
  <details ref="menu" class="dropdown">
    <summary class="button button--secondary">
      {{ label }} <ChevronDown :size="16" aria-hidden="true" />
    </summary>
    <div class="menu-panel dropdown__panel" role="group" :aria-label="label">
      <button
        v-for="item in items"
        :key="item.id"
        class="dropdown__item"
        type="button"
        :disabled="item.disabled"
        @click="selectItem(item)"
      >
        <span v-if="$slots.icon" class="dropdown__icon" aria-hidden="true">
          <slot name="icon" :item="item" />
        </span>
        {{ item.label }}
      </button>
    </div>
  </details>
</template>
