<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { buildAllStatsRows } from '@/lib/wrapped/buildAllStatsRows'
import type { GameId } from '@/types/game'
import type { WrappedSections } from '@/types/wrapped'
import type { WrappedAllStatsMode } from '@/types/wrappedPlanC'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  game: GameId
  sections: WrappedSections
}>()

const mode = ref<WrappedAllStatsMode>('mine')
const expanded = ref<Record<string, boolean>>({})

const mineLabel = computed(() => (props.game === 'drinkit' ? 'My Stats' : 'My Team'))
const oursLabel = computed(() => (props.game === 'drinkit' ? 'Our Stats' : 'All Teams'))

const groups = computed(() => buildAllStatsRows(props.game, props.sections, mode.value))

watch(
  () => props.game,
  () => {
    mode.value = 'mine'
    expanded.value = {}
  },
)

function toggle(specId: string) {
  expanded.value = { ...expanded.value, [specId]: !expanded.value[specId] }
}
</script>

<template>
  <section class="stats" data-testid="wrapped-all-stats">
    <div class="stats__head">
      <h2 class="stats__title">ALL STATS</h2>
      <div class="stats__toggle" role="tablist" aria-label="All stats scope">
        <button
          type="button"
          class="stats__toggle-btn"
          :class="{ 'is-active': mode === 'mine' }"
          role="tab"
          :aria-selected="mode === 'mine'"
          data-testid="wrapped-stats-mine"
          @click="mode = 'mine'"
        >
          {{ mineLabel }}
        </button>
        <button
          type="button"
          class="stats__toggle-btn"
          :class="{ 'is-active': mode === 'ours' }"
          role="tab"
          :aria-selected="mode === 'ours'"
          data-testid="wrapped-stats-ours"
          @click="mode = 'ours'"
        >
          {{ oursLabel }}
        </button>
      </div>
    </div>

    <div v-for="group in groups" :key="group.heading" class="stats__group">
      <h3 class="stats__group-title">{{ group.heading }}</h3>
      <article
        v-for="row in group.rows"
        :key="row.specId"
        class="stats__row"
        :class="{
          'stats__row--centered':
            !row.detail && !row.explanation && !(row.expandable && row.items?.length),
        }"
        data-testid="wrapped-stats-row"
        :data-spec-id="row.specId"
      >
        <div class="stats__icon" aria-hidden="true">
          <AppIcon
            class="stats__icon-glyph"
            :name="(row.icon as SemanticIconKey)"
            style-variant="outline"
          />
        </div>
        <div class="stats__copy">
          <div class="stats__main">
            <p class="stats__label">{{ row.label }}</p>
            <p class="stats__value">{{ row.value }}</p>
          </div>
          <p v-if="row.detail" class="stats__detail">{{ row.detail }}</p>
          <p v-if="row.explanation" class="stats__explain">{{ row.explanation }}</p>
          <div v-if="row.expandable && row.items?.length" class="stats__expand">
            <button
              type="button"
              class="stats__expand-btn"
              @click="toggle(row.specId)"
            >
              {{ expanded[row.specId] ? 'Hide full list' : 'Show full list' }}
            </button>
            <ul v-if="expanded[row.specId]" class="stats__items">
              <li v-for="(item, i) in row.items" :key="i">
                <span>{{ item.label }}</span>
                <span v-if="item.detail" class="stats__item-detail">{{ item.detail }}</span>
              </li>
            </ul>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.stats {
  width: 100%;
  background: var(--theme-gradient-warm);
  color: var(--theme-ink);
  padding: 0.35rem 0 1.5rem;
}

.stats__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.1rem 1rem 0.85rem;
}

.stats__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--theme-ink);
}

.stats__toggle {
  display: inline-flex;
  gap: 0.35rem;
  padding: 0.2rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-primary) 14%, #fff);
}

.stats__toggle-btn {
  min-width: 7.5rem;
  border: 0;
  border-radius: 999px;
  padding: 0.45rem 0.95rem;
  background: transparent;
  color: var(--theme-ink);
  font-size: 0.82rem;
  font-weight: 700;
}

.stats__toggle-btn.is-active {
  background: var(--theme-primary);
  color: #fff;
  box-shadow: none;
}

.stats__group {
  padding: 0.35rem 0.75rem 0.5rem;
}

.stats__group-title {
  margin: 0.55rem 0.35rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--theme-ink);
  opacity: 0.82;
}

.stats__row {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow: hidden;
  margin-bottom: 0.5rem;
  min-height: 4.25rem;
  border-radius: 1rem;
  background: var(--theme-gradient-cool);
  color: var(--theme-ink);
  box-shadow: 0 6px 14px rgba(20, 40, 50, 0.12);
}

.stats__icon {
  display: flex;
  width: 3.85rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background: var(--theme-header, #a32660);
  color: #fff;
}

.stats__icon-glyph {
  font-size: 2.15rem;
  line-height: 1;
}

.stats__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  justify-content: flex-start;
  padding: 0.5rem 0.8rem 0.55rem;
}

.stats__row--centered .stats__copy {
  justify-content: center;
}

.stats__main {
  min-width: 0;
}

.stats__label {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.stats__value {
  margin: 0.1rem 0 0;
  font-family: var(--font-display);
  font-size: 1.375rem;
  font-weight: 800;
  line-height: 1.2;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.stats__detail,
.stats__explain {
  margin: 0.22rem 0 0;
  font-size: 0.9rem;
  font-weight: 400;
  line-height: 1.35;
  color: var(--theme-muted);
}

.stats__expand-btn {
  margin-top: 0.3rem;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--theme-accent, #a32660);
  font-size: 0.9rem;
  font-weight: 700;
}

.stats__items {
  margin: 0.35rem 0 0;
  padding-left: 1rem;
  font-size: 0.9rem;
  line-height: 1.4;
}

.stats__item-detail {
  display: block;
  color: var(--theme-muted);
}

@media (min-width: 402px) {
  .stats__label {
    font-size: 0.8125rem;
  }

  .stats__value {
    font-size: 1.5rem;
  }

  .stats__detail,
  .stats__explain,
  .stats__expand-btn,
  .stats__items {
    font-size: 0.9375rem;
  }

  .stats__icon-glyph {
    font-size: 2.25rem;
  }
}
</style>
