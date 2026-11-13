<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import UiAlert from './UiAlert.vue'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  message: { type: String, required: true },
  variant: {
    type: String,
    default: 'success',
    validator: (value) => ['success', 'warning', 'danger', 'info'].includes(value),
  },
  duration: { type: Number, default: 5000, validator: (value) => value >= 0 },
})
const emit = defineEmits(['update:modelValue', 'dismiss'])
let timeoutId
let remaining = props.duration
let startedAt = 0
const pointerInside = ref(false)
const focusInside = ref(false)
const progressKey = ref(0)
const isPaused = computed(() => pointerInside.value || focusInside.value)

function clearTimer() {
  clearTimeout(timeoutId)
  timeoutId = undefined
}

function startTimer() {
  clearTimer()
  if (!props.modelValue || remaining <= 0 || isPaused.value) return
  startedAt = Date.now()
  timeoutId = setTimeout(dismiss, remaining)
}

function dismiss() {
  clearTimer()
  emit('update:modelValue', false)
  emit('dismiss')
}

function pauseTimer() {
  if (!timeoutId) return
  clearTimer()
  remaining = Math.max(0, remaining - (Date.now() - startedAt))
}

function resumeTimer() {
  if (!isPaused.value && props.modelValue && remaining > 0) startTimer()
}

function handlePointerEnter() {
  pointerInside.value = true
  pauseTimer()
}

function handlePointerLeave() {
  pointerInside.value = false
  resumeTimer()
}

function handleFocusIn() {
  focusInside.value = true
  pauseTimer()
}

function handleFocusOut(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return
  focusInside.value = false
  resumeTimer()
}

watch(
  [() => props.modelValue, () => props.message, () => props.duration],
  ([visible]) => {
    pointerInside.value = false
    focusInside.value = false
    remaining = props.duration
    progressKey.value += 1
    clearTimer()
    if (visible && props.duration > 0) startTimer()
  },
  { immediate: true },
)
onBeforeUnmount(clearTimer)
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="modelValue"
        class="toast-region"
        :class="{ 'toast-region--paused': isPaused }"
        @mouseenter="handlePointerEnter"
        @mouseleave="handlePointerLeave"
        @focusin="handleFocusIn"
        @focusout="handleFocusOut"
      >
        <UiAlert :variant="variant" :live="variant !== 'danger'">
          <div class="toast-region__content">
            <span>{{ message }}</span>
            <button class="button button--tertiary button--sm" type="button" @click="dismiss">
              Fechar
            </button>
          </div>
          <div
            v-if="duration > 0"
            :key="progressKey"
            class="toast-progress"
            :style="{ '--toast-duration': `${duration}ms` }"
            aria-hidden="true"
          ></div>
        </UiAlert>
      </div>
    </Transition>
  </Teleport>
</template>
