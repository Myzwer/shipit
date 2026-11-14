<script setup lang="ts">
import BarBountyCrewsSection from '@/features/admin/BarBountyCrewsSection.vue'
import BountySkipSection from '@/features/admin/BountySkipSection.vue'
import DailyAnnouncementsSection from '@/features/admin/DailyAnnouncementsSection.vue'
import GameStatusSection from '@/features/admin/GameStatusSection.vue'
import VoidSubmissionSection from '@/features/admin/VoidSubmissionSection.vue'
</script>

<template>
  <div data-testid="admin-drinkit-section">
    <GameStatusSection />
    <BarBountyCrewsSection />
    <DailyAnnouncementsSection />
    <BountySkipSection />
    <VoidSubmissionSection />
  </div>
</template>
