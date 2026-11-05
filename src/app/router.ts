import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'game-selection',
      component: () => import('@/features/shared/GameSelectionView.vue'),
      meta: { theme: 'neutral' },
    },
    {
      path: '/drinkit',
      name: 'drinkit-home',
      component: () => import('@/features/drinkit/DrinkItHomeView.vue'),
      meta: { theme: 'drink', game: 'drinkit' },
    },
    {
      path: '/shipit',
      name: 'shipit-home',
      component: () => import('@/features/shipit/ShipItHomeView.vue'),
      meta: { theme: 'ship', game: 'shipit' },
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

export default router
