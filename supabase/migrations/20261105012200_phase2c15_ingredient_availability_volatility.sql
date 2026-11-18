-- Phase 2C.15R: Ingredient availability RPC volatility correction
--
-- get_my_ingredient_bounty_bar_availability was declared STABLE in 12000 but
-- calls bounty_resolve_at, which is VOLATILE and can write. Authenticated
-- PostgREST calls then fail with SQLSTATE 25006 (read-only transaction).
--
-- Fix: declare the existing no-arg function VOLATILE, matching
-- get_my_current_ingredient_bounty. Preserves body, OID, grants, and ACL.
-- Does not change eligibility, scoring, catalog lookup, or permissions.

alter function public.get_my_ingredient_bounty_bar_availability()
volatile;
