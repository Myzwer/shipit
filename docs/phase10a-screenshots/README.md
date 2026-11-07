# Phase 10A/10D scenario screenshots

Captured in **Phase 10D** local runtime qualification against `launch-candidate-v1` on local Supabase.

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

Outputs: `docs/phase10a-screenshots/<scenario>/`.

| Scenario | Notes |
|---|---|
| `embarkation/` | Drink It! Home (Strawberries & Cream), log wizard bars, Ship It! Home/challenges |
| `tuesday/` | Day 4 bounties, interactive beer submit, Gallery/achievements, permission denials |
| `wrapped/` | Day 7 Cruise Wrapped intro + Drink It!/Ship It! results (`14`/`15`) |
