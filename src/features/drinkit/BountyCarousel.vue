<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import PeekCarousel from '@/components/shared/PeekCarousel.vue'
import { copy, formatCopy } from '@/ui/copy'
import type { HomeBountyCardView } from '@/types/bountyHome'

defineProps<{
  cards: HomeBountyCardView[]
}>()

const emit = defineEmits<{
  claim: [card: HomeBountyCardView]
}>()

/** Loop key of a claimed card whose live bounty is momentarily revealed. */
const revealedKey = ref<string | null>(null)

type OverlayKind = 'claimed' | 'overnight' | 'preopen' | 'message'

function overlayKind(card: HomeBountyCardView): OverlayKind | null {
  if (card.presentation === 'claimed') return 'claimed'
  if (card.presentation === 'closed') {
    if (card.title === copy.bounty.seeYouTomorrow) return 'overnight'
    if (card.title === copy.bounty.preOpening) return 'preopen'
    return 'message'
  }
  if (
    card.presentation === 'paused' ||
    card.presentation === 'finale' ||
    card.presentation === 'unavailable' ||
    card.presentation === 'loading'
  ) {
    return 'message'
  }
  return null
}

function splitDetail(detail: string): { body: string; location: string } {
  const marker = ' · Location:'
  const idx = detail.indexOf(marker)
  if (idx === -1) {
    if (detail.startsWith('Location:')) return { body: '', location: detail }
    return { body: detail, location: '' }
  }
  return {
    body: detail.slice(0, idx),
    location: detail.slice(idx + 3).trim(),
  }
}

/** Daily Home cards show the venue name only; Cocktail keeps the Location: prefix. */
function displayLocation(card: HomeBountyCardView): string {
  const location = splitDetail(card.detail).location
  if (card.id !== 'daily') return location
  return location.replace(/^Location:\s*/i, '')
}

function claimLabelFor(card: HomeBountyCardView): string {
  return card.claimLabel || copy.bounty.claimIt
}

function pointsEarned(card: HomeBountyCardView): string {
  const match = /^(\d+)\s+Points$/.exec(card.pointsLabel)
  if (match) return `${match[1]} Points Earned`
  if (card.pointsLabel) return `${card.pointsLabel} Earned`
  return copy.bounty.claimed
}

function cardKey(card: HomeBountyCardView, index: number): string {
  return `${card.id}-${index}-${card.presentation}-${card.title}`
}

function toggleReveal(key: string) {
  revealedKey.value = revealedKey.value === key ? null : key
}

function onActiveChange() {
  revealedKey.value = null
}
</script>

<template>
  <PeekCarousel
    :items="cards"
    :get-key="cardKey"
    :label="copy.home.drinkDailyBounties"
    test-id="bounty-carousel"
    :slide-test-id="(card) => `bounty-card-${card.id}`"
    slide-class="bounty-card"
    stage-background="var(--theme-gradient-warm)"
    stage-padding="1.7rem 0 3.6rem"
    min-height="20.6rem"
    @active-change="onActiveChange"
  >
    <template #slide="{ item: card, index }">
      <article
        class="bounty-card-shell"
        :data-bounty-id="card.id"
        :data-bounty-presentation="card.presentation"
        :data-bar-key="card.claimPrefill?.barCanonicalKey || undefined"
      >
        <div
          class="bounty-card-inner"
          :class="{ 'is-quiet': overlayKind(card) && overlayKind(card) !== 'claimed' }"
        >
          <p v-if="card.tierOrEyebrow" class="bounty-tier">
            {{ card.tierOrEyebrow }}
          </p>
          <p v-if="card.pointsLabel" class="bounty-points">
            {{ card.pointsLabel }}
          </p>

          <p v-if="card.lead" class="bounty-lead">{{ card.lead }}</p>

          <h3 class="bounty-title ui-display-name">{{ card.title }}</h3>

          <p
            v-if="splitDetail(card.detail).body"
            class="bounty-detail"
            :class="{ 'ui-display-name': card.id === 'cocktail' }"
          >
            {{ splitDetail(card.detail).body }}
          </p>
          <p
            v-if="displayLocation(card)"
            class="bounty-location ui-display-name"
          >
            {{ displayLocation(card) }}
          </p>
          <p v-if="card.note" class="bounty-note">{{ card.note }}</p>

          <p
            v-if="card.id === 'bar' && card.crew"
            class="bounty-crew-line"
            data-testid="bar-bounty-crew"
            :data-crew-status="card.crew.status"
          >
            <template v-if="card.crew.status === 'assigned' && card.crew.mateNames?.length">
              {{
                formatCopy(copy.bounty.barCrewLine, {
                  names: card.crew.mateNames.join(', '),
                })
              }}
            </template>
            <template v-else>
              {{ card.crew.message || copy.bounty.barCrewUnavailable }}
            </template>
          </p>

          <div
            v-if="card.timerLabel || card.timerValue"
            class="bounty-timer"
          >
            <p v-if="card.timerLabel" class="bounty-timer-label">
              {{ card.timerLabel }}
            </p>
            <p
              v-if="card.timerValue"
              class="bounty-timer-value"
              data-testid="bounty-timer"
            >
              {{ card.timerValue }}
            </p>
          </div>

          <button
            type="button"
            class="bounty-claim"
            :disabled="!card.claimEnabled"
            :aria-disabled="!card.claimEnabled"
            :title="card.claimTitle"
            :tabindex="card.claimEnabled ? 0 : -1"
            data-testid="bounty-claim"
            @click="card.claimEnabled && emit('claim', card)"
          >
            <span class="bounty-claim-inner">
              <span class="bounty-claim-label">{{ claimLabelFor(card) }}</span>
              <AppIcon name="action.next" class="bounty-claim-icon" />
            </span>
          </button>

          <p class="bounty-footer">{{ card.footer }}</p>
        </div>

        <button
          v-if="overlayKind(card) === 'claimed' && revealedKey !== cardKey(card, index)"
          type="button"
          class="bounty-overlay"
          data-testid="bounty-overlay"
          data-overlay="claimed"
          :aria-label="`${card.heading} claimed. ${pointsEarned(card)}. Show this bounty.`"
          @click="toggleReveal(cardKey(card, index))"
        >
          <span class="bounty-earned">{{ pointsEarned(card) }}</span>
          <AppIcon name="status.selected" style-variant="solid" class="bounty-seal" />
          <span class="bounty-claimed-kicker">{{ card.heading }}</span>
          <span class="bounty-claimed-word">{{ copy.bounty.claimed }}</span>
        </button>

        <div
          v-else-if="overlayKind(card) === 'overnight'"
          class="bounty-overlay"
          data-testid="bounty-overlay"
          data-overlay="overnight"
          role="group"
          :aria-label="`${copy.bounty.seeYouTomorrow}. ${copy.bounty.opensIn} ${card.timerValue}`"
        >
          <p class="bounty-see-you">See You</p>
          <p class="bounty-tomorrow">Tomorrow</p>
          <AppIcon name="status.asleep" style-variant="solid" class="bounty-sleep" />
          <p class="bounty-opens">{{ copy.bounty.opensIn }}</p>
          <p class="bounty-countdown">{{ card.timerValue }}</p>
          <p class="sr-only">{{ card.detail }}</p>
        </div>

        <div
          v-else-if="overlayKind(card) === 'preopen'"
          class="bounty-overlay"
          data-testid="bounty-overlay"
          data-overlay="preopen"
          role="group"
          :aria-label="`${card.title}. ${copy.bounty.opensIn} ${card.timerValue}`"
        >
          <p class="bounty-preopen">{{ card.title }}</p>
          <AppIcon name="status.time" style-variant="solid" class="bounty-sleep" />
          <p class="bounty-opens">{{ copy.bounty.opensIn }}</p>
          <p class="bounty-countdown">{{ card.timerValue }}</p>
          <p class="sr-only">{{ card.detail }}</p>
        </div>

        <div
          v-else-if="overlayKind(card) === 'message'"
          class="bounty-overlay bounty-overlay-message"
          data-testid="bounty-overlay"
          data-overlay="message"
          role="group"
          :aria-label="card.detail ? `${card.title}. ${card.detail}` : card.title"
        >
          <p class="bounty-message-title">{{ card.title }}</p>
          <p v-if="card.detail" class="bounty-message-detail">{{ card.detail }}</p>
        </div>
      </article>
    </template>
  </PeekCarousel>
</template>

<style scoped>
.bounty-card-shell {
  position: relative;
  display: flex;
  width: 100%;
  min-height: inherit;
  flex: 1;
  flex-direction: column;
  padding: 1.2rem 1.15rem 0.95rem;
  background: var(--theme-surface);
  color: var(--theme-ink);
  border-radius: 1.5rem;
}

:deep(.bounty-card) {
  /* PeekCarousel applies depth to the slide; shell fills it. */
  padding: 0;
  background: transparent;
  box-shadow: none;
  border-radius: 1.5rem;
}

.bounty-card-inner {
  display: flex;
  width: 100%;
  flex: 1;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.bounty-card-shell:has([data-overlay='claimed']) .bounty-card-inner {
  opacity: 0.14;
}

.bounty-card-inner.is-quiet .bounty-tier,
.bounty-card-inner.is-quiet .bounty-points,
.bounty-card-inner.is-quiet .bounty-title,
.bounty-card-inner.is-quiet .bounty-detail,
.bounty-card-inner.is-quiet .bounty-location,
.bounty-card-inner.is-quiet .bounty-crew-line,
.bounty-card-inner.is-quiet .bounty-timer {
  visibility: hidden;
}

.bounty-tier {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--theme-muted);
}

.bounty-points {
  margin: 0.45rem 0 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.7rem;
  border-radius: 999px;
  background: var(--theme-accent);
  padding: 0.22rem 0.95rem;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
}

.bounty-lead {
  margin: 0.85rem 0 0;
  max-width: 16rem;
  font-size: 0.78rem;
  font-weight: 400;
  font-style: italic;
  line-height: 1.4;
  color: var(--theme-muted);
}

.bounty-title {
  margin: 0.95rem 0 0;
  max-width: 15.5rem;
  font-family: var(--font-display);
  font-size: 1.28rem;
  font-weight: 700;
  line-height: 1.2;
}

.bounty-detail {
  margin: 0.7rem 0 0;
  max-width: 15.5rem;
  font-size: 0.72rem;
  font-weight: 400;
  font-style: italic;
  line-height: 1.4;
  color: var(--theme-muted);
}

.bounty-crew-line {
  margin: 0.45rem 0 0;
  max-width: 15.5rem;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--theme-ink);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.bounty-note {
  margin: 0.45rem 0 0;
  max-width: 16rem;
  font-size: 0.72rem;
  font-weight: 500;
  line-height: 1.35;
  color: var(--theme-muted);
}

.bounty-location {
  margin: 0.55rem 0 0;
  max-width: 15.5rem;
  font-size: 0.78rem;
  font-weight: 500;
  line-height: 1.3;
}

.bounty-timer {
  margin-top: auto;
  padding-top: 1.15rem;
}

.bounty-timer-label {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 700;
  line-height: 1.2;
}

.bounty-timer-value {
  margin: 0.2rem 0 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.bounty-claim {
  display: inline-flex;
  width: 86%;
  min-height: 2.75rem;
  margin-top: auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: var(--theme-primary);
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
}

.bounty-timer + .bounty-claim {
  margin-top: 0.95rem;
}

.bounty-claim-inner {
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
}

.bounty-claim-label {
  text-align: center;
}

.bounty-claim-icon {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.bounty-claim:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.bounty-footer {
  margin: 0.7rem 0 0;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.2;
  color: var(--theme-muted);
}

.bounty-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  border: 0;
  border-radius: inherit;
  background: rgba(183, 230, 224, 0.94);
  color: var(--theme-ink);
  text-align: center;
  padding: 1.25rem 1rem 1.4rem;
}

.bounty-overlay-message {
  background: rgba(183, 230, 224, 0.9);
}

.bounty-earned {
  font-size: 1.05rem;
  font-weight: 800;
  line-height: 1.2;
}

.bounty-seal {
  margin: 0.35rem 0;
  font-size: 3.1rem;
  color: #3d4450;
}

.bounty-claimed-kicker,
.bounty-claimed-word {
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  line-height: 1.15;
  text-transform: uppercase;
}

.bounty-see-you {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1.05;
}

.bounty-tomorrow,
.bounty-preopen {
  margin: 0;
  max-width: 14rem;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  line-height: 1.1;
  text-transform: uppercase;
}

.bounty-preopen {
  text-transform: none;
  font-size: 1.2rem;
  text-wrap: balance;
}

.bounty-sleep {
  margin: 0.45rem 0 0.2rem;
  font-size: 3.4rem;
  color: #3a4150;
}

.bounty-opens {
  margin: 0.35rem 0 0;
  font-size: 0.78rem;
  font-weight: 700;
}

.bounty-countdown {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.bounty-message-title {
  margin: 0;
  max-width: 16rem;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.25;
}

.bounty-message-detail {
  margin: 0.55rem 0 0;
  max-width: 16rem;
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--theme-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
