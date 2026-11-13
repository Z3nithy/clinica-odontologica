<script setup>
defineProps({
  items: {
    type: Array,
    required: true,
    validator: (items) =>
      Array.isArray(items) &&
      items.every(
        (item) =>
          typeof item.label === 'string' &&
          (item.href === undefined || typeof item.href === 'string'),
      ),
  },
})
</script>

<template>
  <nav aria-label="Breadcrumb" class="breadcrumbs">
    <ol class="breadcrumbs__list">
      <li v-for="(item, index) in items" :key="`${item.label}-${index}`">
        <a v-if="item.href && index < items.length - 1" :href="item.href">{{ item.label }}</a>
        <span v-else aria-current="page">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
