<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import UiIconButton from './UiIconButton.vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, required: true },
  beforeClose: { type: Function, default: undefined },
})
const emit = defineEmits(['update:modelValue', 'close'])
const dialog = ref(null)
let returnFocus = null

async function closeDialog() {
  if (props.beforeClose && !(await props.beforeClose())) return
  emit('update:modelValue', false)
  emit('close')
}

function syncDialog(open) {
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
    syncDialog(open)
  },
)

onMounted(() => syncDialog(props.modelValue))
onBeforeUnmount(() => returnFocus?.focus?.())

function handleClose() {
  if (props.modelValue) closeDialog()
  nextTick(() => returnFocus?.focus?.())
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="ui-dialog"
      :aria-label="title"
      @click.self="closeDialog"
      @keydown.esc.prevent="closeDialog"
      @close="handleClose"
    >
      <header class="ui-dialog__header">
        <h2>{{ title }}</h2>
        <UiIconButton label="Fechar diálogo" @click="closeDialog">
          <X :size="20" aria-hidden="true" />
        </UiIconButton>
      </header>
      <div class="ui-dialog__body"><slot /></div>
      <footer v-if="$slots.footer" class="ui-dialog__footer"><slot name="footer" /></footer>
    </dialog>
  </Teleport>
</template>
