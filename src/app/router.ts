import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useSessionStore } from '@/stores/session'
import type { GameId } from '@/types/game'
import { copy, formatCopy } from '@/ui/copy'

declare module 'vue-router' {
  interface RouteMeta {
    theme?: 'neutral' | 'drink' | 'ship'
    game?: GameId
    public?: boolean
    requiresAuth?: boolean
    requiresAdmin?: boolean
    requiresDualGame?: boolean
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/features/auth/LoginView.vue'),
      meta: { theme: 'neutral', public: true },
    },
    {
      path: '/',
      name: 'game-selection',
      component: () => import('@/features/shared/GameSelectionView.vue'),
      meta: { theme: 'neutral', requiresAuth: true, requiresDualGame: true },
    },
    {
      path: '/drinkit',
      name: 'drinkit-home',
      component: () => import('@/features/drinkit/DrinkItHomeView.vue'),
      meta: { theme: 'drink', game: 'drinkit', requiresAuth: true },
    },
    {
      path: '/drinkit/wrapped',
      name: 'drinkit-wrapped',
      component: () => import('@/features/drinkit/wrapped/DrinkItWrappedView.vue'),
      meta: { theme: 'drink', game: 'drinkit', requiresAuth: true },
    },
    {
      path: '/drinkit/log',
      name: 'drinkit-log',
      component: () => import('@/features/drinkit/log/LogWizardView.vue'),
      meta: { theme: 'drink', game: 'drinkit', requiresAuth: true },
    },
    {
      path: '/drinkit/daily',
      name: 'drinkit-daily',
      component: () => import('@/features/drinkit/DailyClaimView.vue'),
      meta: { theme: 'drink', game: 'drinkit', requiresAuth: true },
    },
    {
      path: '/drinkit/gallery',
      name: 'drinkit-gallery',
      component: () => import('@/features/drinkit/gallery/DrinkItGalleryView.vue'),
      meta: { theme: 'drink', game: 'drinkit', requiresAuth: true },
    },
    {
      path: '/drinkit/achievements',
      name: 'drinkit-achievements',
      component: () => import('@/features/drinkit/achievements/DrinkItAchievementsView.vue'),
      meta: { theme: 'drink', game: 'drinkit', requiresAuth: true },
    },
    {
      path: '/shipit',
      name: 'shipit-home',
      component: () => import('@/features/shipit/ShipItHomeView.vue'),
      meta: { theme: 'ship', game: 'shipit', requiresAuth: true },
    },
    {
      path: '/shipit/wrapped',
      name: 'shipit-wrapped',
      component: () => import('@/features/shipit/wrapped/ShipItWrappedView.vue'),
      meta: { theme: 'ship', game: 'shipit', requiresAuth: true },
    },
    {
      path: '/shipit/challenges',
      name: 'shipit-challenges',
      component: () => import('@/features/shipit/ChallengeListView.vue'),
      meta: { theme: 'ship', game: 'shipit', requiresAuth: true },
    },
    {
      path: '/shipit/challenges/:challengeId/submit',
      name: 'shipit-submit',
      component: () => import('@/features/shipit/ScavengerSubmitView.vue'),
      meta: { theme: 'ship', game: 'shipit', requiresAuth: true },
    },
    {
      path: '/shipit/gallery',
      name: 'shipit-gallery',
      component: () => import('@/features/shipit/gallery/ShipItGalleryView.vue'),
      meta: { theme: 'ship', game: 'shipit', requiresAuth: true },
    },
    {
      path: '/shipit/achievements',
      name: 'shipit-achievements',
      component: () => import('@/features/shipit/achievements/ShipItAchievementsView.vue'),
      meta: { theme: 'ship', game: 'shipit', requiresAuth: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/features/admin/AdminView.vue'),
      meta: { theme: 'neutral', requiresAuth: true, requiresAdmin: true },
    },
    {
      path: '/unavailable',
      name: 'unavailable',
      component: () => import('@/features/auth/UnavailableView.vue'),
      meta: { theme: 'neutral', requiresAuth: true },
    },
    {
      path: '/access-denied',
      name: 'access-denied',
      component: () => import('@/features/auth/AccessDeniedView.vue'),
      meta: { theme: 'neutral', requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

function gameLabel(game: GameId) {
  return game === 'drinkit' ? copy.games.drinkIt : copy.games.shipIt
}

const SUBMISSION_ROUTE_NAMES = new Set([
  'drinkit-log',
  'drinkit-daily',
  'shipit-challenges',
  'shipit-submit',
])

const ACTIVE_HOME_NAMES = new Set(['drinkit-home', 'shipit-home'])

const WRAPPED_NAMES = new Set(['drinkit-wrapped', 'shipit-wrapped'])

router.beforeEach(async (to: RouteLocationNormalized) => {
  const session = useSessionStore()
  await session.init()

  if (session.status === 'initializing') {
    return true
  }

  const isPublic = Boolean(to.meta.public)

  if (!session.isAuthenticated) {
    if (isPublic) return true
    return {
      name: 'login',
      query: to.path !== '/' ? { redirect: to.fullPath } : undefined,
    }
  }

  // Authenticated visitors leave login for their membership home.
  if (to.name === 'login') {
    return session.homePathForMembership()
  }

  // Re-check membership when entering protected app surfaces (not every asset hop).
  if (
    to.meta.game ||
    to.meta.requiresAdmin ||
    to.meta.requiresDualGame ||
    to.name === 'unavailable'
  ) {
    await session.refreshProfile()
  }

  if (session.enabledGames.length === 0) {
    if (to.name !== 'unavailable') return { name: 'unavailable' }
    return true
  }

  if (to.name === 'unavailable') {
    return session.homePathForMembership()
  }

  if (to.meta.requiresDualGame && !session.isDualGame) {
    return session.homePathForMembership()
  }

  if (to.meta.requiresAdmin && !session.isAdmin) {
    return session.homePathForMembership()
  }

  const requiredGame = to.meta.game
  if (requiredGame && !session.hasGame(requiredGame)) {
    return {
      name: 'access-denied',
      query: {
        game: requiredGame,
        message: formatCopy(copy.login.gameNoLongerAllowed, {
          gameName: gameLabel(requiredGame),
        }),
      },
    }
  }

  // Awards Mode navigation (authoritative Ship Clock — not device time).
  // Do not yank Gallery / Achievements / Admin; only remap homes + submission routes.
  if (to.meta.game || WRAPPED_NAMES.has(String(to.name))) {
    const awards = useAwardsModeStore()
    awards.ensureStarted()
    if (awards.status === 'idle' || awards.status === 'loading') {
      await awards.refresh()
    }

    if (awards.isAwardsMode) {
      const game = to.meta.game as GameId | undefined
      const wrappedName = game === 'shipit' ? 'shipit-wrapped' : 'drinkit-wrapped'

      if (ACTIVE_HOME_NAMES.has(String(to.name))) {
        return { name: wrappedName }
      }
      if (SUBMISSION_ROUTE_NAMES.has(String(to.name)) && game) {
        return { name: wrappedName }
      }
    } else if (WRAPPED_NAMES.has(String(to.name))) {
      // Pre-finale: Wrapped route is not the active home.
      // Allow the page to render its "not available" state (no redirect loop).
      return true
    }
  }

  return true
})

export default router
