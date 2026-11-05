# Theme tokens

Semantic CSS variables live in `src/styles/theme.css`.

| Theme class | Game | Primary references |
|---|---|---|
| `.theme-drink` | Drink It! | Teal / magenta / cream from original Home + bounty-state mockups |
| `.theme-ship` | Ship It! | Blue / gold / cream from Ship It! Home mockups |

Apply a theme class on the game shell root. Shared components consume `var(--theme-*)` only—never hardcode a game palette inside shared UI.

**Mockup precedence:** `handoff/design/README.md`. The three files in `latest-available-updates/` override matching older JPGs for Ship It! leaderboard member names, Drink It! Review ingredient link (later phase), and Wrapped Start (later phase).
