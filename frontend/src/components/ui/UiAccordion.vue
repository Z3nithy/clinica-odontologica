<script setup>
import { ref, useId } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = defineProps({
  items: {
    type: Array,
    required: true,
    validator: (items) =>
      Array.isArray(items) &&
      items.every(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.question === 'string' &&
          typeof item.answer === 'string',
      ),
  },
})

const idPrefix = useId()
const openItem = ref(props.items[0]?.id ?? null)

function toggleItem(id) {
  openItem.value = openItem.value === id ? null : id
}
</script>

<template>
  <div class="ui-accordion">
    <article v-for="(item, index) in items" :key="item.id" class="ui-accordion__item">
      <h3 class="ui-accordion__heading">
        <button
          class="ui-accordion__trigger"
          type="button"
          :id="`${idPrefix}-trigger-${index}`"
          :aria-expanded="openItem === item.id"
          :aria-controls="`${idPrefix}-panel-${index}`"
          @click="toggleItem(item.id)"
        >
          <span>{{ item.question }}</span>
          <ChevronDown
            :size="19"
            :class="{ 'is-rotated': openItem === item.id }"
            aria-hidden="true"
          />
        </button>
      </h3>
      <Transition name="accordion">
        <div
          :id="`${idPrefix}-panel-${index}`"
          role="region"
          :aria-labelledby="`${idPrefix}-trigger-${index}`"
          v-show="openItem === item.id"
          class="ui-accordion__panel"
        >
          <div class="ui-accordion__panel-inner">
            <p>{{ item.answer }}</p>
          </div>
        </div>
      </Transition>
    </article>
  </div>
</template>
