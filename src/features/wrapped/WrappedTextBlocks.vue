<script setup lang="ts">
import { computed } from 'vue'
import type { WrappedTextBlock } from '@/types/wrappedPlanC'

const props = defineProps<{
  content: WrappedTextBlock | undefined | null
  as?: 'p' | 'span' | 'div'
}>()

const tag = computed(() => props.as ?? 'p')

const segments = computed(() => {
  const content = props.content
  if (content == null || content === '') return []
  if (typeof content === 'string') return [{ text: content }]
  return content
})
</script>

<template>
  <component :is="tag" v-if="segments.length" class="wrapped-text">
    <template v-for="(seg, i) in segments" :key="i">
      <span
        :class="{
          'wrapped-text--accent': seg.accent,
          'wrapped-text--bold': seg.bold || seg.accent,
        }"
        >{{ seg.text }}</span
      >
    </template>
  </component>
</template>

<style scoped>
.wrapped-text {
  margin: 0;
}

.wrapped-text--accent {
  color: var(--theme-accent, #a32660);
}

.wrapped-text--bold {
  font-weight: 700;
}
</style>
