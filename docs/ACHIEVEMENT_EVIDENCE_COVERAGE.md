# Achievement evidence coverage — Phase 10C

Bands:
- **A** Supported and evidence-backed now
- **B** Engine supported, incomplete source evidence
- **C** Depends on private roster/configuration
- **D** Requires organizer decision

Focus set: D-037–D-066 plus blocked organizer/companion rows.

| Ref | Title | Band | Notes |
|---|---|---|---|
| D-037 | The Gintleman | **A** | Tags present on ingredients |
| D-038 | Tequila Mockingbird | **A** | Tags present on ingredients |
| D-039 | Rum, Forrest, Rum! | **A** | Tags present on ingredients |
| D-040 | Whiskey Business | **A** | Tags present on ingredients |
| D-041 | Crystal Clear | **A** | Tags present on ingredients |
| D-042 | Paint It Black | **B** | Engine ready; no catalog tags yet for spirit-dark |
| D-043 | The Fantastic Four | **A** | distinct_count — not classification-blocked |
| D-044 | Tastes like a Campfire | **A** | exact ingredient keys present |
| D-045 | Easy Peasy Lemon Squeezy | **A** | any — not classification-blocked |
| D-046 | Pineapple Express | **B** | catalog ingredient key `pineapple` |
| D-047 | Heard it on the Coconut Telegraph | **A** | any — not classification-blocked |
| D-048 | Orange You Glad? | **A** | exact ingredient keys present |
| D-049 | How do you milk an almond? | **A** | exact ingredient keys present |
| D-050 | Disco Inferno | **A** | Tags present on ingredients |
| D-051 | Wake Me Up Before You Go-Go | **A** | exact ingredient keys present |
| D-052 | Flower Power | **A** | any — not classification-blocked |
| D-053 | Amaretto Much? | **B** | catalog ingredient key `amaretto` |
| D-054 | Fa-la-la-la Falernum | **A** | exact ingredient keys present |
| D-055 | Lychee Me Alone | **A** | any — not classification-blocked |
| D-056 | I'm Blue (Da Ba Dee) | **A** | exact ingredient keys present |
| D-057 | The Xul Beer is Better | **A** | exact ingredient keys present |
| D-058 | Beet It | **A** | exact ingredient keys present |
| D-059 | Grease Is the Word | **B** | catalog ingredient key `olive-oil-washed-spirit` |
| D-060 | Bitter Sweet Symphony | **A** | exact ingredient keys present |
| D-061 | Anyone got the Thyme? | **A** | any — not classification-blocked |
| D-062 | Kitchen Sink Drink | **A** | 19 offerings with >=7 mapped ingredient_keys |
| D-063 | Double Trouble | **A** | distinct-on-log feasible; tags present 8/9 |
| D-064 | Rum and Rum Again | **A** | distinct-on-log feasible; tags present 4/6 |
| D-065 | The Wine makes it Classy | **A** | Tags present (wine,rose,prosecco); missing champagne |
| D-066 | Fruitcakes in the kitchen | **A** | Tags present on ingredients |
| D-082 | Wrinkles only go where the smiles have been | **D** | Organizer decision blocked |
| D-083 | Screamin' Boat Drinks | **D** | Organizer decision blocked |
| D-085 | Take it to the limit | **D** | Organizer decision blocked |
| D-086 | One Peppy Lopez, Please. | **C** | Private companion UUID map required |
| D-087 | Wasted away again in Margaritaville | **C** | Private companion UUID map required |
| D-088 | A Pirate Looks at 40 | **C** | Private companion UUID map required |
| D-089 | At Least it isn't coors lite | **C** | Private companion UUID map required |
| D-090 | Feeding the Fishes | **C** | Private companion UUID map required |
| D-091 | This is too sweet for me | **C** | Private companion UUID map required |
| D-092 | The Wino and I know | **C** | Private companion UUID map required |
| D-093 | Dear Maria, Count me Gin | **C** | Private companion UUID map required |

## Summary (focus set)

| Band | Count |
|---|---:|
| A | 26 |
| B | 4 |
| C | 8 |
| D | 3 |

## Catalog tag inventory (launch-candidate)

Ingredient tag assignments: `spirit-family-vodka` (8), `spirit-clear` (12), `spirit-family-liqueur` (24), `fruit` (24), `spirit-family-rum` (10), `rum-style-aged` (2), `spirit-family-other` (3), `rum-style-dark` (3), `spirit-family-gin` (5), `spirit-family-tequila` (3), `spirit-family-bourbon` (1), `spirit-family-whiskey` (4), `spirit-family-brandy` (2), `fruit-citrus` (6), `fruit-tropical` (6), `fruit-berry` (3), `fruit-dragon-fruit` (1), `fruit-guava` (1), `hot-pepper` (1), `fruit-lychee` (1), `fruit-mango` (1), `spirit-family-mezcal` (1), `wine` (5), `fruit-passion-fruit` (1), `fruit-pineapple` (1), `prosecco` (1), `rose` (1), `rum-style-spiced` (1), `rum-style-white` (1)

Drink tags: `margarita` (7)

Offerings with ≥7 canonical `ingredient_keys`: **19**

Unknown printed tokens (not mapped): see `content/catalogs/printed-ingredient-map-v1.json`.

D-082 / D-083 / D-085 remain **D**. D-086–D-093 remain **C** until private companion UUID mappings exist. No fake metadata invented to unlock awards.
