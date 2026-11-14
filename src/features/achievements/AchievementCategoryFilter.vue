<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'

export interface AchievementFilterOption {
  key: string
  label: string
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: AchievementFilterOption[]
    /** Visible “Filter by” label. Defaults to achievements copy. */
    label?: string
    /** Root data-testid. Defaults to achievements-filter. */
    testId?: string
    /** Trigger data-testid. Defaults to `${testId}-trigger`. */
    triggerTestId?: string
  }>(),
  {
    label: undefined,
    testId: 'achievements-filter',
    triggerTestId: undefined,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

const selected = computed(
  () => props.options.find((o) => o.key === props.modelValue) ?? props.options[0],
)

const labelText = computed(() => props.label ?? copy.achievements.filterBy)
const labelId = computed(() => `${props.testId}-label`)
const triggerId = computed(() => props.triggerTestId ?? `${props.testId}-trigger`)
const menuTestId = computed(() => `${props.testId}-menu`)

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    activeIndex.value = Math.max(
      0,
      props.options.findIndex((o) => o.key === props.modelValue),
    )
    void nextTick(() => {
      listEl.value?.focus()
      scrollActiveIntoView()
    })
  }
}

function selectOption(key: string) {
  emit('update:modelValue', key)
  close()
}

function scrollActiveIntoView() {
  const el = listEl.value?.querySelector<HTMLElement>(`[data-option-index="${activeIndex.value}"]`)
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest' })
  }
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!open.value) toggle()
  } else if (event.key === 'Escape') {
    close()
  }
}

function onListKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % props.options.length
    scrollActiveIntoView()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value =
      (activeIndex.value - 1 + props.options.length) % props.options.length
    scrollActiveIntoView()
    return
  }
  if (event.key === 'Home') {
    event.preventDefault()
    activeIndex.value = 0
    scrollActiveIntoView()
    return
  }
  if (event.key === 'End') {
    event.preventDefault()
    activeIndex.value = props.options.length - 1
    scrollActiveIntoView()
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const opt = props.options[activeIndex.value]
    if (opt) selectOption(opt.key)
  }
}

function onDocumentPointer(event: PointerEvent) {
  if (!open.value || !rootEl.value) return
  if (!rootEl.value.contains(event.target as Node)) close()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
})

watch(
  () => props.modelValue,
  () => {
    activeIndex.value = Math.max(
      0,
      props.options.findIndex((o) => o.key === props.modelValue),
    )
  },
)
</script>

<template>
  <div
    ref="rootEl"
    class="achievement-filter relative mb-4"
    :data-testid="testId"
  >
    <p
      :id="labelId"
      class="mb-1.5 text-sm font-semibold"
      style="color: var(--theme-ink)"
    >
      {{ labelText }}
    </p>

    <button
      type="button"
      class="achievement-filter__trigger flex min-h-11 w-[13.75rem] max-w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[0.95rem] font-semibold"
      style="
        background: var(--theme-gradient-cool);
        color: var(--theme-ink);
        box-shadow: var(--theme-card-shadow, var(--shadow-card));
      "
      :data-testid="triggerId"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-labelledby="labelId"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="min-w-0 truncate">{{ selected?.label }}</span>
      <AppIcon
        name="action.expand"
        class="shrink-0 text-sm opacity-70 transition"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <ul
      v-if="open"
      ref="listEl"
      class="achievement-filter__menu absolute left-0 z-40 mt-1.5 max-h-72 min-w-[13.75rem] max-w-[min(100vw-2rem,22rem)] overflow-auto rounded-xl py-1 outline-none"
      style="
        background: var(--theme-gradient-cool);
        color: var(--theme-ink);
        box-shadow: var(--theme-card-shadow, var(--shadow-card));
      "
      role="listbox"
      tabindex="-1"
      :aria-labelledby="labelId"
      :data-testid="menuTestId"
      @keydown="onListKeydown"
    >
      <li
        v-for="(opt, index) in options"
        :key="opt.key"
        role="option"
        class="flex min-h-11 cursor-pointer items-center px-3 text-[0.95rem] font-medium"
        :class="index === activeIndex ? 'achievement-filter__option--active' : ''"
        :aria-selected="opt.key === modelValue"
        :data-option-index="index"
        :data-testid="`${testId}-option-${opt.key}`"
        @mouseenter="activeIndex = index"
        @click="selectOption(opt.key)"
      >
        <span class="flex-1">{{ opt.label }}</span>
        <AppIcon
          v-if="opt.key === modelValue"
          name="status.completed"
          style-variant="solid"
          class="text-sm"
          style="color: var(--theme-primary)"
        />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.achievement-filter__option--active {
  background: color-mix(in srgb, var(--theme-primary) 14%, transparent);
}

.achievement-filter__menu [aria-selected='true'] {
  font-weight: 700;
}

.achievement-filter__trigger:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}
</style>
