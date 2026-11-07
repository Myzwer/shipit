-- Phase 10B: Category B price evidence enum value.
-- approved_filtered_within_limit = organizer-approved filtered-source eligibility
-- (exact printed $ absent; never invent $15 as price_usd).
-- Must commit before functions in 082 reference the new label.

alter type public.price_verification_status
  add value if not exists 'approved_filtered_within_limit';

comment on type public.price_verification_status is
  'A=verified_within_limit (exact $≤15). B=approved_filtered_within_limit (organizer-approved filtered source; price_usd null). C=unverified. D=verified_over_limit. not_applicable for non-priced kinds.';
