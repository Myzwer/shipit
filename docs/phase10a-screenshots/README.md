# Phase 10A scenario screenshots

**PENDING** — not captured in Phase 10A.1 agent closeout (Docker socket inaccessible).

Capture after local Supabase + demo seed:

```bash
npx supabase start
npx supabase db reset
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation
npm run dev
LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a

LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario tuesday
PHASE10A_SCENARIO=tuesday LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a

LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario wrapped
PHASE10A_SCENARIO=wrapped LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a
```

Outputs land in `docs/phase10a-screenshots/<scenario>/`.
