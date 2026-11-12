<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import CruiseCountdown from '@/components/shared/CruiseCountdown.vue'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useSessionStore } from '@/stores/session'
import { copy, formatCopy } from '@/ui/copy'

const router = useRouter()
const session = useSessionStore()
const awards = useAwardsModeStore()

/** Prefer countdown chrome until Ship Clock confirms the cruise is active. */
const isPreCruise = computed(() => {
  if (awards.isPreCruise) return true
  if (awards.isAwardsMode) return false
  const lifecycle = awards.state?.lifecycle
  if (lifecycle === 'active' || lifecycle === 'final') return false
  return true
})

/**
 * Homepage layout from authenticated memberships only — never admin status.
 * Hold on `loading` until profile is present so the wrong panel never flashes.
 */
const preCruiseLayout = computed<'loading' | 'both' | 'drinkit' | 'shipit' | 'none'>(() => {
  if (!session.profile) return 'loading'
  const drink = session.hasDrinkIt
  const ship = session.hasShipIt
  if (drink && ship) return 'both'
  if (drink) return 'drinkit'
  if (ship) return 'shipit'
  return 'none'
})

const firstName = computed(() => {
  const raw = session.displayName.trim()
  if (!raw) return 'Guest'
  return raw.split(/\s+/)[0] || raw
})

const welcomeLabel = computed(() =>
  formatCopy(copy.precruise.welcomeGameBegins, { firstName: firstName.value }),
)

onMounted(() => {
  awards.ensureStarted()
  void awards.refresh()
})

watch(
  () => awards.state?.lifecycle,
  (lifecycle) => {
    // Single-game guests leave the shared landing once the cruise activates.
    if (
      lifecycle &&
      lifecycle !== 'pre_cruise' &&
      !session.isDualGame &&
      session.enabledGames.length === 1
    ) {
      void router.replace(session.homePathForMembership())
    }
  },
)

function launch(path: '/drinkit' | '/shipit') {
  void router.push(path)
}

function openRules(game: 'drinkit' | 'shipit') {
  void router.push({ name: game === 'drinkit' ? 'drinkit-rules' : 'shipit-rules' })
}

async function logOut() {
  await session.signOut()
  await router.replace({ name: 'login' })
}
</script>

<template>
  <!-- Active dual-game launcher (unchanged gameplay path). -->
  <div
    v-if="!isPreCruise"
    class="flex min-h-dvh flex-col"
    data-testid="game-selection"
    data-precruise="false"
  >
    <section
      class="relative flex flex-1 flex-col items-center justify-center gap-4 px-8"
      style="background: linear-gradient(to right, #b7e6e1, #e0f5ee); padding-top: env(safe-area-inset-top)"
      data-testid="selection-drinkit"
    >
      <AppIcon name="theme.drink-it" class="text-[3.5rem] leading-none" style="color: #2f3a44" />
      <h1
        class="font-display text-center text-[2.5rem] font-extrabold leading-none tracking-[0.06em]"
        style="color: #1f2933"
      >
        {{ copy.selection.drinkHeadline }}
      </h1>
      <button
        type="button"
        class="mt-1 inline-flex min-h-12 items-center gap-2 rounded-full px-10 py-3.5 text-base font-semibold text-white shadow-md transition"
        style="background: #0a5c6b"
        data-testid="launch-drinkit"
        @click="launch('/drinkit')"
      >
        {{ copy.selection.launch }}
        <AppIcon name="action.next" />
      </button>
    </section>

    <div class="h-px w-full bg-slate-700/40" aria-hidden="true" />

    <section
      class="relative flex flex-1 flex-col items-center justify-center gap-4 px-8"
      style="background: linear-gradient(to right, #ffe2a3, #fff1d4); padding-bottom: env(safe-area-inset-bottom)"
      data-testid="selection-shipit"
    >
      <AppIcon name="theme.ship-it" class="text-[3.5rem] leading-none" style="color: #2f3a44" />
      <h1
        class="font-display text-center text-[2.5rem] font-extrabold leading-none tracking-[0.06em]"
        style="color: #1f2933"
      >
        {{ copy.selection.shipHeadline }}
      </h1>
      <button
        type="button"
        class="mt-1 inline-flex min-h-12 items-center gap-2 rounded-full px-10 py-3.5 text-base font-semibold text-white shadow-md transition"
        style="background: #1d4f91"
        data-testid="launch-shipit"
        @click="launch('/shipit')"
      >
        {{ copy.selection.launch }}
        <AppIcon name="action.next" />
      </button>
    </section>
  </div>

  <!-- Pre-cruise: membership loading (avoid wrong layout flash). -->
  <div
    v-else-if="preCruiseLayout === 'loading'"
    class="precruise-home-loading"
    data-testid="game-selection"
    data-precruise="true"
    data-membership="loading"
  >
    <p>{{ copy.precruise.membershipLoading }}</p>
  </div>

  <!-- Pre-cruise: no game membership assigned. -->
  <div
    v-else-if="preCruiseLayout === 'none'"
    class="precruise-home-none"
    data-testid="game-selection"
    data-precruise="true"
    data-membership="none"
  >
    <div class="precruise-home__account" data-testid="selection-account">
      <button
        type="button"
        class="precruise-home__account-link"
        data-testid="precruise-logout"
        @click="logOut"
      >
        {{ copy.precruise.logOut }}
      </button>
      <RouterLink
        v-if="session.isAdmin"
        :to="{ name: 'admin' }"
        class="precruise-home__account-link"
        data-testid="precruise-admin"
      >
        {{ copy.precruise.admin }}
      </RouterLink>
    </div>
    <div class="precruise-home-none__body">
      <h1 class="precruise-home-none__title">{{ copy.precruise.noGamesTitle }}</h1>
      <p class="precruise-home-none__body-text">{{ copy.precruise.noGamesBody }}</p>
    </div>
  </div>

  <!-- Pre-cruise: Drink It! only. -->
  <div
    v-else-if="preCruiseLayout === 'drinkit'"
    class="precruise-solo precruise-solo--drink"
    data-testid="game-selection"
    data-precruise="true"
    data-membership="drinkit"
  >
    <div class="precruise-home__account" data-testid="selection-account">
      <button
        type="button"
        class="precruise-home__account-link"
        data-testid="precruise-logout"
        @click="logOut"
      >
        {{ copy.precruise.logOut }}
      </button>
      <RouterLink
        v-if="session.isAdmin"
        :to="{ name: 'admin' }"
        class="precruise-home__account-link"
        data-testid="precruise-admin"
      >
        {{ copy.precruise.admin }}
      </RouterLink>
    </div>

    <div class="precruise-solo__content">
      <CruiseCountdown
        class="precruise-solo__countdown"
        home
        :label="welcomeLabel"
      />
      <div class="precruise-home__stack precruise-solo__game" data-testid="selection-drinkit">
        <AppIcon name="theme.drink-it" class="precruise-home__icon" style="color: #2f3a44" />
        <h1 class="precruise-home__title">{{ copy.selection.drinkHeadline }}</h1>
        <button
          type="button"
          class="precruise-home__btn precruise-home__btn--drink"
          data-testid="rules-drinkit"
          @click="openRules('drinkit')"
        >
          {{ copy.precruise.readTheRules }}
          <AppIcon name="action.next" />
        </button>
      </div>
    </div>
  </div>

  <!-- Pre-cruise: Ship It! only. -->
  <div
    v-else-if="preCruiseLayout === 'shipit'"
    class="precruise-solo precruise-solo--ship"
    data-testid="game-selection"
    data-precruise="true"
    data-membership="shipit"
  >
    <div class="precruise-home__account" data-testid="selection-account">
      <button
        type="button"
        class="precruise-home__account-link"
        data-testid="precruise-logout"
        @click="logOut"
      >
        {{ copy.precruise.logOut }}
      </button>
      <RouterLink
        v-if="session.isAdmin"
        :to="{ name: 'admin' }"
        class="precruise-home__account-link"
        data-testid="precruise-admin"
      >
        {{ copy.precruise.admin }}
      </RouterLink>
    </div>

    <div class="precruise-solo__content">
      <CruiseCountdown
        class="precruise-solo__countdown"
        home
        :label="welcomeLabel"
      />
      <div class="precruise-home__stack precruise-solo__game" data-testid="selection-shipit">
        <AppIcon name="theme.ship-it" class="precruise-home__icon" style="color: #2f3a44" />
        <h1 class="precruise-home__title">{{ copy.selection.shipHeadline }}</h1>
        <button
          type="button"
          class="precruise-home__btn precruise-home__btn--ship"
          data-testid="rules-shipit"
          @click="openRules('shipit')"
        >
          {{ copy.precruise.readTheRules }}
          <AppIcon name="action.next" />
        </button>
      </div>
    </div>
  </div>

  <!-- Pre-cruise both-games homepage — approved FE2 composition (unchanged). -->
  <div
    v-else
    class="precruise-home"
    data-testid="game-selection"
    data-precruise="true"
    data-membership="both"
  >
    <section
      class="precruise-home__panel precruise-home__drink"
      data-testid="selection-drinkit"
    >
      <div class="precruise-home__account" data-testid="selection-account">
        <button
          type="button"
          class="precruise-home__account-link"
          data-testid="precruise-logout"
          @click="logOut"
        >
          {{ copy.precruise.logOut }}
        </button>
        <RouterLink
          v-if="session.isAdmin"
          :to="{ name: 'admin' }"
          class="precruise-home__account-link"
          data-testid="precruise-admin"
        >
          {{ copy.precruise.admin }}
        </RouterLink>
      </div>

      <div class="precruise-home__stack">
        <AppIcon name="theme.drink-it" class="precruise-home__icon" style="color: #2f3a44" />
        <h1 class="precruise-home__title">{{ copy.selection.drinkHeadline }}</h1>
        <button
          type="button"
          class="precruise-home__btn precruise-home__btn--drink"
          data-testid="rules-drinkit"
          @click="openRules('drinkit')"
        >
          {{ copy.precruise.readTheRules }}
          <AppIcon name="action.next" />
        </button>
      </div>
    </section>

    <section
      class="precruise-home__panel precruise-home__countdown"
      data-testid="selection-countdown"
    >
      <CruiseCountdown home :label="welcomeLabel" />
    </section>

    <section
      class="precruise-home__panel precruise-home__ship"
      data-testid="selection-shipit"
    >
      <div class="precruise-home__stack">
        <AppIcon name="theme.ship-it" class="precruise-home__icon" style="color: #2f3a44" />
        <h1 class="precruise-home__title">{{ copy.selection.shipHeadline }}</h1>
        <button
          type="button"
          class="precruise-home__btn precruise-home__btn--ship"
          data-testid="rules-shipit"
          @click="openRules('shipit')"
        >
          {{ copy.precruise.readTheRules }}
          <AppIcon name="action.next" />
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.precruise-home {
  display: grid;
  grid-template-rows: minmax(0, 41fr) minmax(0, 14fr) minmax(0, 45fr);
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
}

.precruise-home__panel {
  position: relative;
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding-left: max(1.25rem, env(safe-area-inset-left));
  padding-right: max(1.25rem, env(safe-area-inset-right));
}

.precruise-home__drink {
  background: linear-gradient(to right, #b7e6e1, #e0f5ee);
  padding-top: env(safe-area-inset-top);
}

.precruise-home__countdown {
  background: #ffffff;
  padding-block: 0.35rem;
}

.precruise-home__ship {
  background: linear-gradient(to right, #ffe2a3, #fff1d4);
  padding-bottom: env(safe-area-inset-bottom);
}

.precruise-home__account {
  position: absolute;
  z-index: 1;
  top: max(0.55rem, env(safe-area-inset-top));
  left: max(0.85rem, env(safe-area-inset-left));
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.precruise-home__account-link {
  min-height: 2.5rem;
  padding: 0.35rem 0.1rem;
  border: 0;
  background: transparent;
  color: #2f3a44;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  opacity: 0.78;
}

.precruise-home__account-link:hover,
.precruise-home__account-link:focus-visible {
  opacity: 1;
  text-decoration: underline;
  outline: none;
}

.precruise-home__account-link:focus-visible {
  outline: 2px solid #0a5c6b;
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.precruise-home__stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  width: 100%;
  max-width: 18rem;
}

.precruise-home__icon {
  font-size: 2.65rem;
  line-height: 1;
}

.precruise-home__title {
  margin: 0;
  color: #1f2933;
  font-family: var(--font-display);
  font-size: clamp(1.85rem, 7.2vw, 2.15rem);
  font-weight: 800;
  letter-spacing: 0.05em;
  line-height: 1;
  text-align: center;
}

.precruise-home__btn {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 0.15rem;
  border: 0;
  border-radius: 999px;
  padding: 0.65rem 1.55rem;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.2;
  box-shadow: 0 4px 12px rgba(31, 41, 51, 0.14);
}

.precruise-home__btn--drink {
  background: #0a5c6b;
}

.precruise-home__btn--ship {
  background: #1d4f91;
}

.precruise-home__btn:focus-visible {
  outline: 2px solid #1f2933;
  outline-offset: 2px;
}

.precruise-solo {
  position: relative;
  display: flex;
  min-height: 100dvh;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
  padding:
    max(16vh, calc(env(safe-area-inset-top) + 4.25rem))
    max(1.25rem, env(safe-area-inset-right))
    max(2rem, env(safe-area-inset-bottom))
    max(1.25rem, env(safe-area-inset-left));
}

.precruise-solo--drink {
  background: linear-gradient(to right, #b7e6e1, #e0f5ee);
}

.precruise-solo--ship {
  background: linear-gradient(to right, #ffe2a3, #fff1d4);
}

.precruise-solo__content {
  display: flex;
  width: 100%;
  max-width: 22rem;
  flex-direction: column;
  align-items: center;
  gap: clamp(1.5rem, 5vh, 2.75rem);
}

.precruise-solo__countdown {
  width: 100%;
}

.precruise-solo__game {
  gap: 0.85rem;
}

.precruise-home-loading,
.precruise-home-none {
  position: relative;
  display: flex;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  background: #f7f4ef;
  padding:
    max(3.5rem, calc(env(safe-area-inset-top) + 2.5rem))
    max(1.25rem, env(safe-area-inset-right))
    max(2rem, env(safe-area-inset-bottom))
    max(1.25rem, env(safe-area-inset-left));
  color: #5b6770;
  text-align: center;
}

.precruise-home-none__body {
  max-width: 20rem;
}

.precruise-home-none__title {
  margin: 0;
  color: #1f2933;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
}

.precruise-home-none__body-text {
  margin: 0.85rem 0 0;
  font-size: 0.95rem;
  line-height: 1.55;
}

@media (max-height: 720px) {
  .precruise-home__stack {
    gap: 0.5rem;
  }

  .precruise-home__icon {
    font-size: 2.25rem;
  }

  .precruise-home__title {
    font-size: 1.75rem;
  }

  .precruise-home__btn {
    min-height: 2.5rem;
    padding: 0.55rem 1.35rem;
    font-size: 0.9rem;
  }

  .precruise-solo__content {
    gap: 1.25rem;
  }
}
</style>
