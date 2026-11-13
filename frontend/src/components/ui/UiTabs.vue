<script setup>
import { computed, useId } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  tabs: {
    type: Array,
    required: true,
    validator: (items) =>
      Array.isArray(items) &&
      items.every((item) => typeof item.id === 'string' && typeof item.label === 'string'),
  },
})
const emit = defineEmits(['update:modelValue'])
const idPrefix = useId()
const activeTab = computed(() => props.tabs.find((tab) => tab.id === props.modelValue))

function moveFocus(event, index) {
  const enabledTabs = props.tabs
    .map((tab, tabIndex) => ({ tab, tabIndex }))
    .filter(({ tab }) => !tab.disabled)
  if (!enabledTabs.length) return

  const currentIndex = enabledTabs.findIndex(({ tabIndex }) => tabIndex === index)
  let nextIndex
  if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = enabledTabs.length - 1
  else if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % enabledTabs.length
  else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
  } else return

  event.preventDefault()
  const { tab } = enabledTabs[nextIndex]
  emit('update:modelValue', tab.id)
  document.getElementById(`${idPrefix}-tab-${tab.id}`)?.focus()
}
</script>

<template>
  <div class="tabs">
    <div class="tabs__list" role="tablist">
      <button
        v-for="(tab, index) in tabs"
        :id="`${idPrefix}-tab-${tab.id}`"
        :key="tab.id"
        class="tabs__tab"
        type="button"
        role="tab"
        :aria-selected="modelValue === tab.id"
        :aria-controls="`${idPrefix}-panel-${tab.id}`"
        :tabindex="modelValue === tab.id ? 0 : -1"
        :disabled="tab.disabled"
        @click="emit('update:modelValue', tab.id)"
        @keydown="moveFocus($event, index)"
      >
        <span v-if="$slots.icon" class="tabs__icon" aria-hidden="true">
          <slot name="icon" :tab="tab" />
        </span>
        {{ tab.label }}
      </button>
    </div>
    <Transition name="tab-panel" mode="out-in">
      <section
        v-if="activeTab"
        :id="`${idPrefix}-panel-${activeTab.id}`"
        :key="activeTab.id"
        class="tabs__panel"
        role="tabpanel"
        :aria-labelledby="`${idPrefix}-tab-${activeTab.id}`"
        tabindex="0"
      >
        <slot :tab="activeTab" />
      </section>
    </Transition>
  </div>
</template>
