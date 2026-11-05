# Seeds

Phase 1A does **not** commit SQL seeds with passwords.

Local Auth users + memberships are created by:

```bash
export LOCAL_TEST_PASSWORD='…'
npm run db:provision
```

See `docs/SUPABASE_LOCAL.md`.
