# Private preview photos (example)

Copy this convention to `private/photos/` (gitignored).

```
private/photos/
  manifest.json          # maps scenario media keys → local file paths
  embarkation/           # optional; usually empty
  tuesday/
    drink-001.jpg
    scavenger-001.jpg
  wrapped/
    scavenger-finale.jpg
```

## manifest.json shape

```json
{
  "version": 1,
  "media": [
    {
      "key": "tuesday-drink-both-1",
      "path": "tuesday/drink-001.jpg",
      "kind": "drink_log",
      "notes": "Permissioned social photo for development preview only"
    },
    {
      "key": "tuesday-scavenger-alpha-1",
      "path": "tuesday/scavenger-001.jpg",
      "kind": "scavenger",
      "notes": "Permissioned"
    }
  ]
}
```

Rules:
- Do **not** commit real guest photos or identifiable cruise media.
- Demo seed uploads through the existing authenticated Storage / Gallery path.
- If `private/photos/manifest.json` is missing, scenarios use clearly marked development placeholder bytes.
