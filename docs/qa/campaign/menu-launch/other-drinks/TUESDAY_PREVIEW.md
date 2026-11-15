# Tuesday gameplay preview

## Exact URL

| Preview | URL | Supabase |
|---|---|---|
| **Tuesday (this mission)** | **http://127.0.0.1:5188** | **http://127.0.0.1:55321** (`star-princess-disposable-mo`) |
| Organizer Wrapped (protected) | http://127.0.0.1:5173 | http://127.0.0.1:54321 (`star-princess-local`) — **do not reset** |

## Environment identity

| Stack | Port | Cruise id | Role |
|---|---|---|---|
| Organizer | `:54321` | `48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13` | Protected Wrapped / final |
| Agent 1 disposable | `:55321` | disposable active cruise (not organizer id) | Tuesday Day 4 preview + feature tests |
| Agent 2 | `:56321` | `191aaab1-c67a-445d-86e7-8fd6f99fc26d` | Untouched |

## How Tuesday was enabled

On **disposable only**:

1. Verified stack identity (`star-princess-disposable-mo`, not organizer/Agent2).
2. Aligned `dev_seed_cruise_clock` so wall-clock **now** maps to **Tuesday Day 4 ~14:00** ship time (`lifecycle=active`, `accepting_submissions=true`, `finalized=false`).
3. Cleared game-control finale latch (`status=active`, `finalized_at_utc=null`) for drinkit/shipit.
4. Initialized bounty schedule via Admin `admin_initialize_bounty_schedule` (72/39/7/7) when empty.
5. Started a **separate** Vite on port **5188** with `VITE_SUPABASE_URL=http://127.0.0.1:55321` so organizer `.env.local` → `:54321` stayed untouched.

Merely changing a displayed date was **not** used. Server-authoritative ship clock + game_control remain intact.

## Organizer steps

1. Open **http://127.0.0.1:5188** (not 5173).
2. Log in with a disposable Drink It! identity (synthetic roster on this stack), e.g. **Demo Drink Only** / `drink.only@star-princess.local`, password from `.local/qa2a-disposable.env` `LOCAL_TEST_PASSWORD`.
3. Drink It! → **Log a Drink** (+) → pick any physical bar → **Other Drinks** → pick an option → companions.
4. Confirm Ship It!, Admin, Gallery, Wrapped routes still load on this preview as available.

If Vite 5188 is down:

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship It"
env VITE_SUPABASE_URL='http://127.0.0.1:55321' \
  VITE_SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
  npx vite --host 127.0.0.1 --port 5188 --strictPort
```

To re-align Tuesday afternoon if the clock drifted:

```bash
node --input-type=module <<'EOF'
import * as L from './scripts/gate-a/lib.mjs'
const { service } = L.createClients()
const now = Date.now()
const shipDateOnDay = new Date(now).toISOString().slice(0,10)
const offsetMinutes = Math.round((Date.parse(`${shipDateOnDay}T14:00:00Z`) - now) / 60000)
const day1 = new Date(`${shipDateOnDay}T12:00:00Z`); day1.setUTCDate(day1.getUTCDate() - 3)
await service.rpc('dev_seed_cruise_clock', {
  p_day1_ship_date: day1.toISOString().slice(0,10),
  p_base_offset_minutes: offsetMinutes,
  p_label: 'development-only',
})
for (const g of ['drinkit','shipit']) {
  await service.from('game_control').update({ finalized_at_utc: null, status: 'active' }).eq('game', g)
}
EOF
```

## Return to Wrapped

- **Organizer Wrapped** was never left — keep using **http://127.0.0.1:5173** → `:54321` (still `lifecycle=final`).
- Disposable can return to pre-cruise / other scenarios later with gate-a clock helpers; do **not** run `qa:activate wrapped` against organizer without authorization.

## Notes

- Disposable Tuesday uses synthetic demo identities (private-roster passwords from organizer Auth are not provisioned on `:55321`).
- Home Daily Bounty cards may show unavailable / load gaps on this sparse disposable ledger; **logging wizard + Other Drinks** are the verified review path.
