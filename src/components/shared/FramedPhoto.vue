<script setup lang="ts">
import { computed } from 'vue'
import {
  DEFAULT_PHOTO_FRAMING,
  framedImageStyle,
  normalizeFramingInput,
  type PhotoFraming,
  type PhotoFramingWire,
} from '@/lib/media/framing'

const props = withDefaults(
  defineProps<{
    src: string
    width: number
    height: number
    framing?: PhotoFraming | PhotoFramingWire | null
    alt?: string
    /** Extra classes on the square frame (e.g. gallery-polaroid-photo). */
    frameClass?: string
    imgTestId?: string
  }>(),
  {
    framing: null,
    alt: '',
    frameClass: '',
    imgTestId: undefined,
  },
)

defineEmits<{
  error: [event: Event]
}>()

const resolved = computed(() => {
  const raw = normalizeFramingInput(props.framing ?? DEFAULT_PHOTO_FRAMING)
  return framedImageStyle(props.width, props.height, raw)
})
</script>

<template>
  <div
    class="framed-photo"
    :class="frameClass"
    data-testid="framed-photo"
  >
    <img
      :src="src"
      :alt="alt"
      :style="resolved"
      draggable="false"
      :data-testid="imgTestId"
      @error="$emit('error', $event)"
    />
  </div>
</template>
