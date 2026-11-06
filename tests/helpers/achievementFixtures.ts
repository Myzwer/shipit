import type { SupabaseClient } from '@supabase/supabase-js'

/** Small test-only catalog covering condition families A–K. Never production content. */
export async function seedTestAchievementCatalog(service: SupabaseClient) {
  await clearTestAchievements(service)

  const defs = [
    {
      stable_key: 'test-first-drink-log',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'milestones',
      title: 'Test First Sip',
      display_description: 'Log any drink (including zero points).',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'event_count',
      condition_config: { event: 'drink_log', threshold: 1 },
    },
    {
      stable_key: 'test-three-distinct-cocktails',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'milestones',
      title: 'Test Cocktail Collector',
      display_description: 'Log three distinct catalog cocktails.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'distinct_count',
      condition_config: { subject: 'drink_concepts', threshold: 3 },
    },
    {
      stable_key: 'test-double-bounty-same-log',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Double Dip',
      display_description: 'Claim two bounty categories on one log.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'same_submission_claims',
      condition_config: { min_categories: 2 },
    },
    {
      stable_key: 'test-secret-ten-logs',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Secret Decade',
      display_description: 'Log ten drinks.',
      secret: true,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'event_count',
      condition_config: { event: 'drink_log', threshold: 10 },
    },
    {
      stable_key: 'test-beer-mode',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Beer Mode',
      display_description: 'Log a generic beer.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'exact_match',
      condition_config: { drink_mode: 'generic_beer' },
    },
    {
      stable_key: 'test-rum-tag',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Rum Tag',
      display_description: 'Log a cocktail with curated rum tag.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'tag_match',
      condition_config: { scope: 'ingredient', tags: ['spirit-rum'], match: 'any' },
    },
    {
      stable_key: 'test-interval-30',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Quick Pair',
      display_description: 'Two drink logs within 30 minutes.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'event_interval',
      condition_config: { event: 'drink_log', max_minutes: 30 },
    },
    {
      stable_key: 'test-companion-min',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Social Hour',
      display_description: 'Log with at least one companion.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'companion_predicate',
      condition_config: { mode: 'min_companions', threshold: 1 },
    },
    {
      stable_key: 'test-first-team-piazza',
      game: 'shipit',
      owner_type: 'team',
      group_key: 'firsts',
      title: 'Test First Piazza',
      display_description: 'First team to complete The Piazza Grandeur.',
      secret: false,
      exclusive: true,
      enabled: true,
      test_only: true,
      condition_type: 'exact_match',
      condition_config: { challenge_key: 'the-piazza-grandeur' },
    },
    {
      stable_key: 'test-team-category-one-each',
      game: 'shipit',
      owner_type: 'team',
      group_key: 'milestones',
      title: 'Test Category Spread',
      display_description: 'Complete one challenge in every scavenger category.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'category_completion',
      condition_config: { mode: 'one_per_category' },
    },
    {
      stable_key: 'test-unknown-should-never-seed',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Should Not Enable',
      display_description: 'Disabled unknown type fixture.',
      secret: false,
      exclusive: false,
      enabled: false,
      test_only: true,
      condition_type: 'event_count',
      condition_config: { event: 'drink_log', threshold: 1 },
    },
  ]

  const { error } = await service.from('achievement_definitions').insert(defs)
  if (error) throw error
}

export async function clearTestAchievements(service: SupabaseClient) {
  const { error } = await service.rpc('dev_clear_test_achievements')
  if (error) {
    // Fallback when cruise not yet seeded (development-only gate): best-effort wipe.
    await service.from('gallery_events').update({ achievement_award_id: null }).not('achievement_award_id', 'is', null)
    await service.from('achievement_awards').update({ gallery_event_id: null }).not('id', 'is', null)
    await service.from('gallery_events').delete().eq('kind', 'achievement')
    await service.from('achievement_awards').delete().not('id', 'is', null)
    await service.from('achievement_definitions').delete().eq('test_only', true)
    await service.from('ingredient_tags').delete().gte('tag', '')
    await service.from('drink_concept_tags').delete().gte('tag', '')
  }
}
