# Phase V4 — Achievement unlock popup + Gallery outline

Visual QA captures at 402×874 (plus 360/430 for single + multi).

| File | What |
|---|---|
| `00-mockup-reference.jpg` | Approved Drink It! achievement popup mockup |
| `01-gallery-before-popup-402.png` | Gallery before modal |
| `02-single-unlock-402.png` | Single unlock (catalog icon + See It) |
| `04-multi-unlock-six-402.png` | Six unlocks (badge-check + See All) |
| `03-gallery-after-dismiss-402.png` | Gallery after dismiss |
| `05-gallery-no-persistent-outline-402.png` | No sticky teal ring after `?submission=` |
| `06-shipit-single-unlock-402.png` | Ship It! single styling |
| `07-shipit-multi-unlock-402.png` | Ship It! multi styling |
| `08-keyboard-focus-still-visible-402.png` | Focus still works after popup |

Recapture (does **not** consume awards — injects store state):

```bash
LOCAL_TEST_PASSWORD='…' node scripts/capture-v4-achievement-popup.mjs http://localhost:5173
```
