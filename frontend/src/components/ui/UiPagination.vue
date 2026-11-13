<script setup>
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps({
  page: {
    type: Number,
    required: true,
    validator: (value) => Number.isInteger(value) && value > 0,
  },
  totalPages: {
    type: Number,
    required: true,
    validator: (value) => Number.isInteger(value) && value > 0,
  },
})
const emit = defineEmits(['update:page'])
const pages = computed(() => Array.from({ length: props.totalPages }, (_, index) => index + 1))
</script>

<template>
  <nav class="pagination" aria-label="Paginação">
    <button
      class="pagination__item pagination__control"
      type="button"
      :disabled="page <= 1"
      aria-label="Página anterior"
      @click="emit('update:page', page - 1)"
    >
      <ChevronLeft :size="17" aria-hidden="true" />
    </button>
    <button
      v-for="number in pages"
      :key="number"
      class="pagination__item"
      type="button"
      :aria-label="`Página ${number}`"
      :aria-current="page === number ? 'page' : undefined"
      @click="emit('update:page', number)"
    >
      {{ number }}
    </button>
    <button
      class="pagination__item pagination__control"
      type="button"
      :disabled="page >= totalPages"
      aria-label="Próxima página"
      @click="emit('update:page', page + 1)"
    >
      <ChevronRight :size="17" aria-hidden="true" />
    </button>
  </nav>
</template>
