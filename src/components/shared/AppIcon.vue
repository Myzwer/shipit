<script setup lang="ts">
import { computed } from 'vue'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { resolveIcon, type IconStyle, type SemanticIconKey } from '@/ui/icons'

const props = withDefaults(
  defineProps<{
    name: SemanticIconKey
    styleVariant?: IconStyle
    label?: string
  }>(),
  {
    styleVariant: 'outline',
    label: undefined,
  },
)

const icon = computed(() => resolveIcon(props.name, props.styleVariant))
</script>

<template>
  <FontAwesomeIcon
    :icon="icon"
    :aria-hidden="label ? undefined : true"
    :aria-label="label"
    role="img"
  />
</template>
