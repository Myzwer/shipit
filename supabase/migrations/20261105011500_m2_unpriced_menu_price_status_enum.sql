-- M2-P1: Category U price_status enum value.
-- approved_unpriced_menu_within_limit = organizer-authorized complete price-free
-- physical bar menu (price_usd null; never invent $15).
-- Must commit before functions in 11600 reference the new label.

alter type public.price_verification_status
  add value if not exists 'approved_unpriced_menu_within_limit';

comment on type public.price_verification_status is
  'A=verified_within_limit (exact $≤15). B=approved_filtered_within_limit (organizer-approved filtered source; price_usd null). U=approved_unpriced_menu_within_limit (organizer-authorized complete price-free physical bar menu; price_usd null; requires source_notes.unpriced_menu_authorizations). C=unverified. D=verified_over_limit. not_applicable for non-priced kinds.';
