# Private preview photos (example)

Copy this convention to `private/photos/` (gitignored).

```
private/photos/
  manifest.json          # optional ordering map
  *.jpg / *.jpeg / *.png / *.webp / *.heic
  tuesday/               # optional subfolders — recursive scan
  wrapped/
```

## Auto-discovery (Phase 10F)

`npm run demo:seed` recursively loads usable images from `private/photos/`.

- HEIC/HEIF are converted locally to JPEG under `.local/demo-photo-cache/` when needed.
- Max size: 5 MiB (existing upload pipeline limit).
- Accuracy does **not** matter — photos are assigned arbitrarily across simulated drink logs and Ship It! completions for visual-fidelity demos.
- Embarkation stays essentially photo-empty; Tuesday gets a believable mid-cruise set; Wrapped gets a denser full-cruise Gallery.
- If no usable files are present, seeds fall back to the tiny development JPEG fixture.

## Optional manifest.json

```json
{
  "version": 1,
  "media": [
    {
      "key": "any-label",
      "path": "some-folder/photo-001.jpg",
      "kind": "drink_log",
      "notes": "Permissioned social photo for development preview only"
    }
  ]
}
```

When `manifest.json` lists existing paths, that order is preferred; otherwise a sorted recursive scan is used.

## Privacy

- Do **not** commit real guest photos or identifiable cruise media.
- Do **not** commit private-roster Gallery screenshots that show those photos.
- Demo seed uploads only to the **local** Supabase `game-photos` bucket.
