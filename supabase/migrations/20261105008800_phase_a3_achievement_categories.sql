-- Stage A3: achievement category groups for Drinking with Davids + Bar Gauntlets.
-- Append-only enum extension. Does not alter existing definition rows.

alter type public.achievement_group add value if not exists 'drinking_with_davids';
alter type public.achievement_group add value if not exists 'bar_gauntlets';

comment on type public.achievement_group is
  'Achievement UI/filter groups. drinking_with_davids and bar_gauntlets added in Stage A3; category display order lives in content/achievements/categories.json.';
