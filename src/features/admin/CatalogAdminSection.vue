<script setup lang="ts">
import AddDrinkSection from '@/features/admin/AddDrinkSection.vue'
import CatalogExportSection from '@/features/admin/CatalogExportSection.vue'
import CatalogImportSection from '@/features/admin/CatalogImportSection.vue'
</script>

<template>
  <div data-testid="admin-catalog-section">
    <AddDrinkSection />
    <CatalogExportSection />
    <CatalogImportSection />
  </div>
</template>
