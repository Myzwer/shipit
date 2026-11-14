# Photo framing — deliverable captures

Local Vite + Supabase. Non-destructive square framing across Drink It! / Ship It!.

## Screenshots

| File | What it shows |
|---|---|
| `01-editor-default.png` | Framing overlay with default centered crop; **Use Photo** ready without interaction |
| `02-editor-adjusted.png` | After drag + wheel zoom (subject shifted) |
| `03-capture-preview-framed.png` | Accepted square preview + **Adjust Photo** |
| `04-review-framed.png` | Review uses the same framing |
| `05-editor-portrait-default.png` | Portrait original, default centered crop |
| `06-gallery-framed.png` | Gallery polaroid after submit |

## Representation

```ts
{ zoom: number /* 1..4, 1 = cover-fit */, centerX: number /* 0..1 */, centerY: number /* 0..1 */ }
```

Persisted on `photos` as `crop_zoom`, `crop_center_x`, `crop_center_y`. Bound photos freeze framing. Gallery feed returns `photo_framing` + dimensions. Full viewer / download still use the original Storage object.
