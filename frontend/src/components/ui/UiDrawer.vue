<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import UiIconButton from './UiIconButton.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  side: {
    type: String,
    default: 'right',
    validator: (value) => ['left', 'right'].includes(value),
  },
})
const emit = defineEmits(['update:modelValue', 'close'])
const dialog = ref(null)
let returnFocus = null

function closeDrawer() {
  emit('update:modelValue', false)
  emit('close')
}

function syncDrawer(open) {
  if (!dialog.value) return
  if (open && !dialog.value.open) {
    returnFocus = document.activeElement
    dialog.value.showModal()
  } else if (!open && dialog.value.open) {
    dialog.value.close()
  }
}

watch(
  () => props.modelValue,
  async (open) => {
    await nextTick()
    syncDrawer(open)
  },
)
onMounted(() => syncDrawer(props.modelValue))
onBeforeUnmount(() => returnFocus?.focus?.())

function handleClose() {
  if (props.modelValue) closeDrawer()
  nextTick(() => returnFocus?.focus?.())
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="ui-drawer"
      :class="`ui-drawer--${side}`"
      :aria-label="title"
      @click.self="closeDrawer"
      @keydown.esc.prevent="closeDrawer"
      @close="handleClose"
    >
      <header class="ui-dialog__header">
        <h2>{{ title }}</h2>
        <UiIconButton label="Fechar painel" @click="closeDrawer">
          <X :size="20" aria-hidden="true" />
        </UiIconButton>
      </header>
      <div class="ui-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="ui-dialog__footer"><slot name="footer" /></footer>
    </dialog>
  </Teleport>
</template>
