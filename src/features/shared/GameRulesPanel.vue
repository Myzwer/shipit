<script setup lang="ts">
/**
 * Authoritative player rules UI shared by Pre-Cruise pages and in-game How to Play.
 * Content source: content/precruise/PC1_Player_Rules_Approved_Copy.md
 */
import { computed, nextTick, ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import {
  PRECRUISE_RULE_CATEGORY_OPTIONS,
  rulesForGame,
} from '@/content/precruiseRules'
import { ruleEmphasisRuns } from '@/lib/precruise/parsePlayerRules'
import type { RulesCategoryKey } from '@/lib/precruise/parsePlayerRules'
import { copy, formatCopy } from '@/ui/copy'

const props = withDefaults(
  defineProps<{
    game: 'drinkit' | 'shipit'
    /** Show approved intro paragraphs above the section nav. */
    showIntro?: boolean
  }>(),
  {
    showIntro: true,
  },
)

const selected = ref<RulesCategoryKey>('quick')
const navEl = ref<HTMLElement | null>(null)
const contentEl = ref<HTMLElement | null>(null)

const rules = computed(() => rulesForGame(props.game))
const navOptions = PRECRUISE_RULE_CATEGORY_OPTIONS

const activeCategory = computed(
  () =>
    rules.value.categories.find((c) => c.key === selected.value) ??
    rules.value.categories[0],
)

const footerAction = computed(() => {
  const index = navOptions.findIndex((o) => o.key === selected.value)
  if (index < 0) return null
  if (selected.value === 'faq') {
    return {
      key: 'quick' as RulesCategoryKey,
      label: copy.precruise.backToQuickRules,
      kind: 'back' as const,
    }
  }
  const next = navOptions[index + 1]
  if (!next) return null
  return {
    key: next.key,
    label: formatCopy(copy.precruise.nextSection, { section: next.label }),
    kind: 'next' as const,
  }
})

async function selectCategory(key: RulesCategoryKey) {
  selected.value = key
  await nextTick()
  const target = navEl.value ?? contentEl.value
  if (!target) return
  const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - 8)
  window.scrollTo({ top, behavior: 'smooth' })
}
</script>

<template>
  <div class="game-rules-panel" data-testid="game-rules-panel">
    <div v-if="showIntro" class="mb-5 space-y-3 px-1">
      <p
        v-for="(paragraph, index) in rules.intro"
        :key="index"
        class="text-[0.95rem] leading-[1.6]"
        style="color: var(--theme-ink)"
        :class="index === 0 ? 'italic' : ''"
      >
        <template v-for="(run, runIndex) in ruleEmphasisRuns(paragraph)" :key="runIndex">
          <strong v-if="run.strong">{{ run.text }}</strong>
          <template v-else>{{ run.text }}</template>
        </template>
      </p>
    </div>

    <nav
      ref="navEl"
      class="rules-nav"
      :aria-label="copy.precruise.rulesNavLabel"
      data-testid="rules-nav"
    >
      <button
        v-for="option in navOptions"
        :key="option.key"
        type="button"
        class="rules-nav__btn"
        :class="{ 'is-active': selected === option.key }"
        :aria-current="selected === option.key ? 'page' : undefined"
        :data-testid="`rules-nav-${option.key}`"
        @click="selectCategory(option.key)"
      >
        {{ option.label }}
      </button>
    </nav>

    <section
      ref="contentEl"
      class="rules-prose"
      :aria-label="activeCategory?.label"
      data-testid="rules-content"
    >
      <article
        v-for="section in activeCategory?.sections ?? []"
        :key="`${selected}-${section.title}`"
        class="rules-prose__section"
      >
        <h2 class="rules-prose__heading">{{ section.title }}</h2>
        <div class="rules-prose__body">
          <template v-for="(block, blockIndex) in section.blocks" :key="blockIndex">
            <p v-if="block.type === 'paragraph'">
              <template
                v-for="(run, runIndex) in ruleEmphasisRuns(block.text ?? '')"
                :key="runIndex"
              >
                <strong v-if="run.strong">{{ run.text }}</strong>
                <template v-else>{{ run.text }}</template>
              </template>
            </p>
            <ol
              v-else-if="block.type === 'list' && block.ordered"
              class="rules-prose__list rules-prose__list--ordered"
            >
              <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
                <template
                  v-for="(run, runIndex) in ruleEmphasisRuns(item)"
                  :key="runIndex"
                >
                  <strong v-if="run.strong">{{ run.text }}</strong>
                  <template v-else>{{ run.text }}</template>
                </template>
              </li>
            </ol>
            <ul
              v-else-if="block.type === 'list'"
              class="rules-prose__list rules-prose__list--bullet"
            >
              <li v-for="(item, itemIndex) in block.items" :key="itemIndex">
                <template
                  v-for="(run, runIndex) in ruleEmphasisRuns(item)"
                  :key="runIndex"
                >
                  <strong v-if="run.strong">{{ run.text }}</strong>
                  <template v-else>{{ run.text }}</template>
                </template>
              </li>
            </ul>
          </template>
        </div>
      </article>

      <div v-if="footerAction" class="rules-prose__footer">
        <button
          type="button"
          class="ui-primary-btn w-full"
          data-testid="rules-section-next"
          @click="selectCategory(footerAction.key)"
        >
          {{ footerAction.label }}
          <AppIcon v-if="footerAction.kind === 'next'" name="action.next" />
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.rules-nav {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  margin-bottom: 1.25rem;
}

.rules-nav__btn {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 0.9rem;
  padding: 0.65rem 0.7rem;
  color: var(--theme-ink);
  background: var(--theme-gradient-cool);
  box-shadow: var(--theme-card-shadow, var(--shadow-card));
  font-size: 0.92rem;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}

.rules-nav__btn.is-active {
  background: var(--theme-primary);
  color: #ffffff;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-primary) 35%, transparent);
}

.rules-nav__btn:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.rules-prose__section + .rules-prose__section {
  margin-top: 1.45rem;
  padding-top: 1.35rem;
  border-top: 1px solid color-mix(in srgb, var(--theme-ink) 12%, transparent);
}

.rules-prose__heading {
  margin: 0 0 0.55rem;
  color: var(--theme-ink);
  font-family: var(--font-display);
  font-size: 1.12rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  line-height: 1.25;
}

.rules-prose__body p,
.rules-prose__list {
  margin: 0.7rem 0 0;
  color: var(--theme-ink);
  font-size: 0.95rem;
  font-weight: 400;
  line-height: 1.65;
}

.rules-prose__body p:first-child,
.rules-prose__list:first-child {
  margin-top: 0;
}

.rules-prose__list {
  padding-left: 1.25rem;
}

.rules-prose__list--bullet {
  list-style: disc;
}

.rules-prose__list--ordered {
  list-style: decimal;
}

.rules-prose__list li + li {
  margin-top: 0.35rem;
}

.rules-prose__body strong {
  font-weight: 700;
}

.rules-prose__footer {
  margin-top: 1.75rem;
  padding-top: 0.35rem;
}
</style>
