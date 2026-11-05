# Star Princess — Bar Crawl Beverage Database

> **Display-only friendly aliases:** Parenthetical explanations are there to help players understand unfamiliar brand names and mixers (for example, Cointreau (orange liqueur)). They do **not** establish a second ingredient or alter eligibility, rarity, pricing or the original menu evidence. Use `Star-Princess-Beverage-Source-Unmodified.md` for literal ingredient strings; use the JSON alias map below only to populate a separate `display_label` field. No new recipe ingredients were inferred. Brands and ingredient types are not necessarily interchangeable for bounty scoring. If an alias is ambiguous, retain the printed ingredient and flag it during the Saturday menu audit.
**Scope:** 13 publicly accessible game bars; named alcoholic cocktails, beer, cider, hard seltzer/ready-to-drink alcohol, and wine by the glass found in the supplied menu PDFs. **Price rule:** a beverage explicitly listed at **$16 or more was omitted**. All listed *priced* beverages were $15 or less on their source menus. Pricing is intentionally omitted from the drink entries.

**Source vintage:** Uploaded Princess menu PDFs, largely bearing 2025 revision dates, sourced by the user from the Star Princess bar-menu article. They are menu snapshots, not a guarantee of future availability; a later Princess beverage-program refresh may change offerings. Ingredient strings below describe **only ingredients printed in the source**; the absence of an ingredient does not mean it is absent from the actual drink. Some spelling/brand punctuation is normalized. Wine entries mean **single glasses**, not bottles.

**Exception — Good Spirits:** Its source PDF has *no listed cocktail prices*. Those cocktails are provided under `Price eligibility: UNVERIFIED`, **not confirmed under the $15 limit**, and should not be treated as automatically game-eligible. Do not infer their price.

**Shared pool-menu caution:** Promenade Bars, Lido Bar, The MIX, and Star Bar reuse `Star_Princess_Pool_Bar.pdf`; repetition in this file is for bar-by-bar parsing convenience, **not** independent proof every beverage is sold at every bar. Star Bar is the least verified mapping. A given drink can legitimately appear at multiple bars.

**Excluded:** The casino bar, International Café, Coffee Currents, restricted/ticketed venues, nonalcoholic-only beverages, whole wine bottles, drinks over $15, and unpriced shared flights/towers or premium experiences. Standalone spirit pours are not represented as cocktails (the source lists many spirit brands separately).

## Good Spirits at Sea (Deck 7)

- **Source:** `Star_Princess_Good_Spirits_Menu.pdf`
- **Evidence:** Venue-named PDF, but no prices printed. ALL cocktails below have unverified $15 eligibility; do not treat them as confirmed game-eligible until prices are checked.
- **Price eligibility:** UNVERIFIED — source gives no prices

### Cocktails

- **Gin & Tonic Ultima** — Hendrick's Gin, lime wheel, lemon peel, juniper, tonic.
- **Azul Blanco** — Silver tequila, lime, blue curaçao (orange liqueur with blue coloring), pineapple, elderflower foam.
- **Grappa Peach** — Grappa (grape spirit), lemon, honey, peach schnapps, Prosecco.
- **Bangkok Mule** — Whiskey, basil, lemongrass and ginger syrup, lime, ginger beer.
- **Apples Delight** — Calvados (apple brandy), fresh lemon juice, honey syrup, St-Germain (elderflower liqueur), apples, port.
- **Sandia en Fuego** — Don Julio Reposado Tequila, serrano pepper, watermelon, lime, agave.
- **The Great Pumpkin** — Bacardi 8 Rum, aquafaba (chickpea liquid used to make foam), pumpkin syrup, cinnamon, nutmeg, lemon.
- **Vanilla Sky** — Vanilla vodka, triple sec (orange liqueur), fresh pineapple, orgeat syrup (almond syrup), lime, agave.
- **The Cartagena Cool** — Appleton Rum, cinnamon, orange bitters, chocolate bitters, orange peel.
- **Coco-Café** — Gosling's Rum, Lavazza espresso, coconut cream, kosher salt, grated nutmeg, chocolate.
- **Aperitivo Roma** — Limoncello (lemon liqueur), Aperol (bitter-orange aperitif), Canadian whiskey, bitters, mint leaves.
- **Barbados Swizzler** — Bacardi light rum, Bacardi dark rum, fresh grapefruit juice, agave, Velvet Falernum (lime-and-spice liqueur), bitters.
- **Key Lime Martini** — Whiskey, agave, lime juice, Cointreau (orange liqueur), vanilla, condensed milk, pineapple juice, graham cracker and cinnamon rim, elderflower foam.
- **Mykonos Press** — Ouzo (anise-flavored spirit), Hendrick's Gin, lemon juice, simple syrup (sugar syrup), soda, lime/lemonade, grenadine (red fruit syrup, usually pomegranate-flavored).
- **Pastis Pearl** — Hendrick's Gin, pastis (anise-flavored spirit), lemon juice, simple syrup (sugar syrup), aquafaba (chickpea liquid used to make foam).
- **Saint Petersburg Mule** — Vodka, lemon juice, honey syrup, apple juice, ginger beer.
- **Starry Night in Oslo** — Aquavit (herb-spiced spirit), black charcoal tea, lemon juice, agave, fresh ginger.
- **Loch Ness Martini** — Hendrick's Gin, lime juice, agave, Cointreau (orange liqueur), cucumber, salt.
- **Butterfly** — Gin, lemon juice, Cointreau (orange liqueur), simple syrup; butterfly tea mentioned in menu description (not explicitly in ingredient line).

## O'Malley's Irish Pub (Deck 7)

- **Source:** `Star_OMalleys_Bar_Menu.pdf`
- **Evidence:** O’Malley’s printed venue menu. No beer/wine inventory appears on the supplied one-page PDF; this does not imply beer/wine is unavailable aboard.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Classic Coffee** — Jameson Irish Whiskey, coffee, whipped cream.
- **Sláinte Irish Coffee** — Sláinte Irish Whiskey, coffee, whipped cream.
- **Banoffee Bliss** — Banana-infused Irish coffee with Jameson Irish Whiskey (other ingredients not specified).
- **Raspberry-ing** — Absolut Raspberry Vodka, orange liqueur, cranberry, lime.
- **Clover Breeze** — Absolut Vodka, lavender, lemon, melon.
- **Pair of Queens** — Beefeater Gin, Velvet Falernum (lime-and-spice liqueur), pineapple, lime, orgeat (almond syrup).
- **Under the Mango Tree** — Jameson Irish Whiskey, mango, lemon, mint.
- **The Lucky Charm** — Meili Vodka, St-Germain liqueur (elderflower liqueur), melon, lime, Lemon Betty Buzz (as printed; specific product unclear).
- **Maid of the Sea** — Jameson Irish Whiskey, St-Germain liqueur (elderflower liqueur), lemon, mint.
- **Spank Mint** — Sláinte Irish Whiskey, fresh lime juice, mint, Gosling's ginger beer.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.
- **Passion of the Irish** — Sláinte Irish Whiskey, Galliano (vanilla-herbal liqueur), passion fruit, orange, vanilla, soda.

## Princess Live! (Deck 7)

- **Source:** `Star_Princess_Live_Bar_Menu.pdf`
- **Evidence:** One-page Star Princess bar menu; beer, cider and canned vodka drinks also listed.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Cosmopolitan** — Absolut Elyx Vodka, Cointreau (orange liqueur), cranberry.
- **French Martini** — Absolut Elyx Vodka, Chambord (raspberry liqueur), pineapple.
- **Chocolate Orange Espresso-Tini** — Tito's Handmade Vodka, Cointreau (orange liqueur), Kahlúa (coffee liqueur), dark crème de cacao (dark chocolate liqueur), espresso.
- **Ferrero** — Absolut Vanilla Vodka, Licor 43 Chocolate (chocolate liqueur), Baileys (Irish cream liqueur), Frangelico (hazelnut liqueur), Nutella.
- **Passion Fruit Chili Margarita** — Patrón Silver Tequila, jalapeños, passion fruit, lime, agave.
- **June Bug** — Melon liqueur, Malibu Rum, banana liqueur, pineapple, sweet and sour.
- **Passion Fruit Vanilla Sour** — Tito's Handmade Vodka, Aperol (bitter-orange aperitif), pineapple, lemon, vanilla.
- **Cucumber Elderflower** — Hendrick's Gin, St-Germain elderflower liqueur, cucumber, lemon.
- **Wild Berry Spritz** — Truly Hard Seltzer Wild Berry, Aperol (bitter-orange aperitif), Bombay Gin, cranberry, strawberry, lemon.
- **Pineapple Paloma** — Ilegal Mezcal Joven, agave, grapefruit, lime, jalapeños, pineapple.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **Sweetest Sounds** — Crossfire Hurricane Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Straight Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Spank Mint** — Sláinte Irish Whiskey, lime, mint, Gosling's ginger beer.
- **Frosé** — Tito's Vodka, Hampton Water Rosé, strawberry, pear, grenadine (red fruit syrup, usually pomegranate-flavored).

### Beer

- Bud Light
- Budweiser
- Heineken
- Heineken Silver
- Michelob Ultra
- Corona Extra
- Guinness
- Lagunitas IPA
- Peroni Nastro Azzurro
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Angry Orchard cider
- Truly Hard Seltzer (Pineapple, Wild Berry, Sparkling Lemonade)
- Sun Cruiser Lemon Iced Tea Vodka

## Bellini's Cocktail Bar (Deck 7)

- **Source:** `Star_Princess_Bellinis.pdf`
- **Evidence:** Venue-specific multi-page menu. Wine entries below are by the glass (nonalcoholic rosé omitted).
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Aperol Spritz** — Aperol (bitter-orange aperitif), Val d'Oca Prosecco (Italian sparkling wine), soda.
- **Hugo Spritz** — St-Germain elderflower liqueur, lime, Val d'Oca Prosecco (Italian sparkling wine), soda.
- **Raspberry Lemonade** — Absolut Raspberry Vodka, limoncello (lemon liqueur), lime, lemonade.
- **Summer in Italy** — Limoncello (lemon liqueur), Aperol (bitter-orange aperitif), Val d'Oca Prosecco (Italian sparkling wine).
- **Italian Sparrow** — Aperol (bitter-orange aperitif), lemon, Val d'Oca Prosecco (Italian sparkling wine).
- **Red Ferrari** — Aperol (bitter-orange aperitif), grapefruit, lemon, Val d'Oca Prosecco (Italian sparkling wine).
- **Passion Lilly** — Montenegro Amaro (herbal bittersweet liqueur), Italicus (bergamot liqueur), lemon, passion fruit, vanilla, Val d'Oca Prosecco (Italian sparkling wine).
- **Limecello Spritz** — Villa Massa Limoncello, Prosecco, mint, Betty Buzz Meyer Lemon.
- **Sgroppini** — Tito's Handmade Vodka, limoncello (lemon liqueur), lemon, peach purée, honey, agave.
- **Roma** — Hendrick's Gin, St-Germain elderflower liqueur, limoncello (lemon liqueur), raspberries.
- **Star Signature Tiramisu** — Kahlúa (coffee liqueur), chocolate liqueur, Baileys (Irish cream liqueur), Licor 43 (vanilla-citrus liqueur), espresso.
- **Almond Italia** — Disaronno Amaretto (almond-flavored liqueur), Kahlúa (coffee liqueur), Baileys (Irish cream liqueur), cream, espresso.
- **Passionfruit (Tiramisu)** — Chinola Passionfruit Liqueur, Baileys (Irish cream liqueur), Licor 43 (vanilla-citrus liqueur), cream, espresso.
- **Banana Biscotti** — Giffard Banana Liqueur, Kahlúa (coffee liqueur), Baileys (Irish cream liqueur), cream, espresso.
- **Crème Brûlée (Tiramisu)** — Licor 43 Crème Brûlée, Kahlúa (coffee liqueur), Baileys (Irish cream liqueur), cream, espresso.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **Strawberry Fields Forever** — Meili Vodka, basil, strawberries, agave, elderflower liqueur, Betty Buzz sparkling lime.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.

### Wine by the glass

- Prosecco
- Love by Britto Prosecco
- Hampton Water Sparkling Rosé
- Piper-Heidsieck Champagne
- Moscato
- Chardonnay
- Sauvignon Blanc
- Rosé
- Hampton Water Rosé
- Seven Daughters Moscato
- Pinot Noir
- Cabernet Sauvignon

## Wheelhouse Bar (Deck 7)

- **Source:** `Star_Princess_Wheelhouse_Bar_Menu.pdf`
- **Evidence:** Venue-specific seven-page menu. Includes its Steakhouse Classics menu and wines by the glass.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Dark & Stormy** — Gosling's Black Seal Rum, Gosling's ginger beer, lime.
- **Hotel Nacional** — Bacardi Reserva Ocho Rum, apricot liqueur, pineapple, lime, simple syrup (sugar syrup).
- **Painkiller** — Gosling's Black Seal Rum, pineapple, coconut, orange.
- **Mango Mai Tai** — Bacardi Spiced Rum, orange curaçao (orange liqueur), mango, almond syrup, lime.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, lime, ginger.
- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, lime, passion fruit, pineapple, Angostura bitters.
- **New York Sour** — Woodford Reserve Bourbon, lemon, red wine float.
- **Central Park** — Bacardi White Rum, melon liqueur, banana liqueur, lime.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **Strawberry Fields Forever** — Meili Vodka, basil, strawberries, agave, elderflower liqueur, Betty Buzz sparkling lime.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.

### Wine by the glass

- Prosecco
- Love by Britto Prosecco
- Hampton Water Sparkling Rosé
- Piper-Heidsieck Champagne
- Moscato
- Chardonnay
- Sauvignon Blanc
- Rosé
- Hampton Water Rosé
- Seven Daughters Moscato
- Pinot Noir
- Cabernet Sauvignon

### Beer

- Bud Light
- Budweiser
- Corona
- Peroni
- Heineken
- Blue Moon

### Cider, hard seltzer and ready-to-drink alcohol

- Angry Orchard cider
- Truly Hard Seltzer
- Sun Cruiser Iced Tea Vodka

## Crooners (Deck 8)

- **Source:** `Star_Princess_Crooners_Bar_Menu.pdf`
- **Evidence:** Venue-specific four-page menu. Wine entries are by the glass; alcoholic beer/cider and RTDs listed.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Classic Cosmo** — Absolut Elyx Vodka, Cointreau (orange liqueur), cranberry, lime.
- **French Martini** — Absolut Elyx Vodka, Chambord (raspberry liqueur), pineapple.
- **Crooners Signature 007** — Absolut Elyx Vodka or Tanqueray Gin, olive brine.
- **Figs & Honey** — Absolut Elyx Vodka, lemon, honey thyme syrup, fig jam.
- **Clover Club** — Bombay Gin, Chambord (raspberry liqueur), lemon, raspberry, agave.
- **Rum Brûlée** — Appleton Rum, crème de cacao (chocolate liqueur), Banane du Brésil (banana liqueur), walnut bitters.
- **Cask and Coco** — Jameson Irish Whiskey, Licor 43 (vanilla-citrus liqueur), crème de cacao (chocolate liqueur), salted caramel.
- **Ferrero** — Absolut Vanilla Vodka, Licor 43 Chocolate (chocolate liqueur), Baileys (Irish cream liqueur), Frangelico (hazelnut liqueur), Nutella.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **Strawberry Fields Forever** — Meili Vodka, basil, strawberries, agave, elderflower liqueur, Betty Buzz sparkling lime.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.

### Wine by the glass

- Prosecco
- Love by Britto Prosecco
- Hampton Water Sparkling Rosé
- Piper-Heidsieck Champagne
- Moscato
- Chardonnay
- Sauvignon Blanc
- Rosé
- Hampton Water Rosé
- Seven Daughters Moscato
- Pinot Noir
- Cabernet Sauvignon

### Beer

- Bud Light
- Budweiser
- Heineken Silver
- Coors Light
- Michelob Ultra
- Miller Lite
- Blue Moon Belgian White Ale
- Corona Extra
- Heineken
- Lagunitas IPA
- Peroni Nastro Azzurro
- Red Stripe

### Cider, hard seltzer and ready-to-drink alcohol

- Angry Orchard cider
- Truly Hard Seltzer
- Sun Cruiser Iced Tea Vodka

## Wake View Bar (Deck 8)

- **Source:** `Star_Princess_Wake_View_Bar_Menu.pdf`
- **Evidence:** Venue-specific two-page menu; by-the-glass Archer Roose wines. Named cocktail section is clearly priced.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Dragon Fruit Refresher** — Patrón Silver Tequila, triple sec (orange liqueur), lime, agave, dragon fruit.
- **Seabreeze Spritz** — Tito's Handmade Vodka, peach liqueur, blue curaçao (orange liqueur with blue coloring), lychee liqueur, lemon, Sprite.
- **Blue Pineapple Margarita** — Patrón Silver Tequila, pineapple, blue curaçao (orange liqueur with blue coloring), agave, lime.
- **Frozen Aperol Spritz** — Aperol (bitter-orange aperitif), Prosecco, orange.
- **Sand Meets the Sea** — Ilegal Mezcal Joven, blue curaçao (orange liqueur with blue coloring), lychee liqueur, agave, lime, ginger.
- **Sunsets on the Ocean** — Unicorn Butterfly Tea Tequila, triple sec (orange liqueur), peach schnapps, orange, peach purée, lemon.
- **Aperol Frosé** — Aperol (bitter-orange aperitif), Hampton Water Rosé, orange, strawberries.
- **Ocean Dreams** — Malibu Rum, peach liqueur, pineapple, lemon.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Pantalones Tequila Sunrise** — Pantalones Blanco Tequila, passion fruit, orange, grenadine (red fruit syrup, usually pomegranate-flavored).
- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **Strawberry Fields Forever** — Meili Vodka, basil, strawberries, agave, elderflower liqueur, Betty Buzz sparkling lime.

### Wine by the glass

- Archer Roose Sauvignon Blanc
- Archer Roose Pinot Noir
- Archer Roose Rosé
- Archer Roose Sparkling

### Beer

- Bud Light
- Budweiser
- Heineken Silver
- Coors Light
- Michelob Ultra
- Blue Moon
- Corona Extra
- Heineken
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Truly Hard Seltzer
- Angry Orchard cider
- Sun Cruiser Iced Tea Vodka
- Sprinter Black Cherry
- Sprinter Grapefruit
- Sprinter Lime
- Sprinter Peach

## Promenade Bars (Deck 9)

- **Source:** `Star_Princess_Pool_Bar.pdf`
- **Evidence:** Shared Star Princess Pool Bar PDF, linked/used for Promenade by Eat Sleep Cruise. This is not a photographed independent Promenade-specific menu. Both Promenade counters count as one game bar.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Frosé** — Tito's Handmade Vodka, Hampton Water Rosé, strawberry, pear.
- **Truly Caliente Fresca** — Truly Strawberry Lemonade, Patrón Silver Tequila, lime, jalapeños, mint.
- **Truly Pineapple & Coconut Daiquiri** — Truly Hard Seltzer Pineapple, Malibu Rum, coconut, orgeat (almond syrup).
- **Jungle Bird** — Bacardi White Rum, Bacardi Spiced Rum, Campari (bitter herbal aperitif), lime, pineapple.
- **Lychee Vodka Mojito** — Tito's Handmade Vodka, lychee, fresh mint, lime.
- **Peanut Jungle Ball** — Skrewball Peanut Butter Whiskey (peanut-butter-flavored whiskey), Campari (bitter herbal aperitif), falernum, orgeat (almond syrup), lemon, lime, dark rum float.
- **Can't Feel the Rain** — Ketel One Vodka, peach, pineapple, lemon, honey.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.
- **Frozen Aperol Spritz** — Aperol (bitter-orange aperitif), Prosecco, orange, club soda.
- **Guava Margarita** — Patrón Silver Tequila, Cointreau (orange liqueur), lime, guava.
- **Coconut Margarita** — Patrón Silver Tequila, triple sec (orange liqueur), lime, coconut.

### Wine by the glass

- Archer Roose Sauvignon Blanc
- Archer Roose Pinot Noir
- Archer Roose Rosé
- Archer Roose Sparkling

### Beer

- Bud Light
- Budweiser
- Coors Light
- Michelob Ultra
- Corona Extra
- Heineken
- Heineken Silver
- Lagunitas IPA
- Peroni Nastro Azzurro
- Red Stripe
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Truly Hard Seltzer
- Angry Orchard cider
- Sun Cruiser Iced Tea Vodka
- Sprinter Black Cherry
- Sprinter Grapefruit
- Sprinter Lime
- Sprinter Peach

## Sea View Bar (Deck 17)

- **Source:** `Star_Princess_Seaview_Bar_Menu.pdf`
- **Evidence:** Venue-specific two-page menu; Archer Roose wines sold by the glass.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Dragon Fruit Mojito** — Bacardi White Rum, dragon fruit, agave, lime, mint, soda.
- **Frozen Aperol Spritz** — Aperol (bitter-orange aperitif), Prosecco, orange.
- **Aperol Coconut Margarita** — Patrón Silver Tequila, Aperol (bitter-orange aperitif), Grand Marnier (orange liqueur), lime, coconut, agave.
- **Spicy Mango Margarita** — Patrón Silver Tequila, Cointreau (orange liqueur), mango, serrano pepper.
- **Strawberries & Cream** — Don Julio Blanco Tequila, Malibu Rum, strawberries, coconut, agave.
- **Under the Sea** — Beefeater Gin, St-Germain liqueur (elderflower liqueur), lemon, orgeat (almond syrup).
- **Aperol Frosé** — Aperol (bitter-orange aperitif), Hampton Water Rosé, orange juice, strawberries.
- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Pantalones Tequila Sunrise** — Pantalones Blanco Tequila, passion fruit, orange, grenadine (red fruit syrup, usually pomegranate-flavored).
- **Peanut Butter & Jelly (Carajillo)** — Licor 43 Original (vanilla-citrus liqueur), Skrewball Peanut Butter Whiskey (peanut-butter-flavored whiskey), Chambord (raspberry liqueur), strawberry, espresso.
- **Grilled Pineapple (Carajillo)** — Licor 43 Original (vanilla-citrus liqueur), caramelized pineapple, Ilegal Mezcal Joven, agave, espresso.
- **Chocolate Orange (Carajillo)** — Licor 43 Chocolate (chocolate liqueur), Grand Marnier (orange liqueur), orange marmalade, espresso.
- **The Original Carajillo** — Licor 43 (vanilla-citrus liqueur), espresso.

### Wine by the glass

- Archer Roose Sauvignon Blanc
- Archer Roose Pinot Noir
- Archer Roose Rosé
- Archer Roose Sparkling

### Beer

- Bud Light
- Budweiser
- Heineken Silver
- Michelob Ultra
- Corona Extra
- Heineken
- Peroni Nastro Azzurro
- Red Stripe
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Truly Hard Seltzer
- Angry Orchard cider
- Sun Cruiser Iced Tea Vodka
- Sprinter Black Cherry
- Sprinter Grapefruit
- Sprinter Lime
- Sprinter Peach

## Cascade Bar (Deck 17)

- **Source:** `Star_Princess_Cascade_Bar_Menu.pdf`
- **Evidence:** Venue-specific six-page menu. Only cocktails priced $15 or less and the by-the-glass Plus wine selection are included.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Cloudy Skies** — Meili Vodka, amaretto (almond-flavored liqueur), pineapple, hibiscus syrup, citrus, pink peppercorn.
- **Montana Springs** — Meili Vodka, peach liqueur, Seven Daughters Moscato, melon, lemon, Fever-Tree Yuzu Lime.
- **Caught in the Rip Tide** — Meili Vodka, Ilegal Joven Mezcal, Chinola passion fruit liqueur, cucumber, lime, coconut, habanero bitters.
- **Crimson Current** — Meili Vodka, Aperol (bitter-orange aperitif), lime, ginger, beetroot, grapefruit soda.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Lilypad** — Olive oil-washed Tanqueray Gin, St-Germain elderflower liqueur, lemon.
- **Passion Lilly** — Chamomile-infused Absolut Vanilla Vodka, lychee liqueur, passion fruit, pineapple, vanilla, Prosecco.
- **Amazonia** — Cachaça, Banane du Brésil (banana liqueur), mango, agave, lime, mint.
- **Glacier Water** — Ilegal Reposado Mezcal, blue curaçao (orange liqueur with blue coloring), pamplemousse liqueur, lime, grapefruit, agave.

### Wine by the glass

- Prosecco
- Love by Britto Prosecco
- Hampton Water Sparkling Rosé
- Piper-Heidsieck Champagne
- Moscato
- Chardonnay
- Sauvignon Blanc
- Rosé
- Hampton Water Rosé
- Seven Daughters Moscato
- Pinot Noir
- Cabernet Sauvignon

## Lido Bar (Deck 17)

- **Source:** `Star_Princess_Pool_Bar.pdf`
- **Evidence:** Shared Star Princess Pool Bar PDF used as provisional Lido Bar menu; independently named Lido-only list not supplied. Check local actual offerings.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Frosé** — Tito's Handmade Vodka, Hampton Water Rosé, strawberry, pear.
- **Truly Caliente Fresca** — Truly Strawberry Lemonade, Patrón Silver Tequila, lime, jalapeños, mint.
- **Truly Pineapple & Coconut Daiquiri** — Truly Hard Seltzer Pineapple, Malibu Rum, coconut, orgeat (almond syrup).
- **Jungle Bird** — Bacardi White Rum, Bacardi Spiced Rum, Campari (bitter herbal aperitif), lime, pineapple.
- **Lychee Vodka Mojito** — Tito's Handmade Vodka, lychee, fresh mint, lime.
- **Peanut Jungle Ball** — Skrewball Peanut Butter Whiskey (peanut-butter-flavored whiskey), Campari (bitter herbal aperitif), falernum, orgeat (almond syrup), lemon, lime, dark rum float.
- **Can't Feel the Rain** — Ketel One Vodka, peach, pineapple, lemon, honey.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.
- **Frozen Aperol Spritz** — Aperol (bitter-orange aperitif), Prosecco, orange, club soda.
- **Guava Margarita** — Patrón Silver Tequila, Cointreau (orange liqueur), lime, guava.
- **Coconut Margarita** — Patrón Silver Tequila, triple sec (orange liqueur), lime, coconut.

### Wine by the glass

- Archer Roose Sauvignon Blanc
- Archer Roose Pinot Noir
- Archer Roose Rosé
- Archer Roose Sparkling

### Beer

- Bud Light
- Budweiser
- Coors Light
- Michelob Ultra
- Corona Extra
- Heineken
- Heineken Silver
- Lagunitas IPA
- Peroni Nastro Azzurro
- Red Stripe
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Truly Hard Seltzer
- Angry Orchard cider
- Sun Cruiser Iced Tea Vodka
- Sprinter Black Cherry
- Sprinter Grapefruit
- Sprinter Lime
- Sprinter Peach

## The MIX (Deck 17)

- **Source:** `Star_Princess_Pool_Bar.pdf`
- **Evidence:** Shared Star Princess Pool Bar PDF used as provisional The MIX menu; independently named MIX-only list not supplied. Check local actual offerings.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Frosé** — Tito's Handmade Vodka, Hampton Water Rosé, strawberry, pear.
- **Truly Caliente Fresca** — Truly Strawberry Lemonade, Patrón Silver Tequila, lime, jalapeños, mint.
- **Truly Pineapple & Coconut Daiquiri** — Truly Hard Seltzer Pineapple, Malibu Rum, coconut, orgeat (almond syrup).
- **Jungle Bird** — Bacardi White Rum, Bacardi Spiced Rum, Campari (bitter herbal aperitif), lime, pineapple.
- **Lychee Vodka Mojito** — Tito's Handmade Vodka, lychee, fresh mint, lime.
- **Peanut Jungle Ball** — Skrewball Peanut Butter Whiskey (peanut-butter-flavored whiskey), Campari (bitter herbal aperitif), falernum, orgeat (almond syrup), lemon, lime, dark rum float.
- **Can't Feel the Rain** — Ketel One Vodka, peach, pineapple, lemon, honey.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.
- **Frozen Aperol Spritz** — Aperol (bitter-orange aperitif), Prosecco, orange, club soda.
- **Guava Margarita** — Patrón Silver Tequila, Cointreau (orange liqueur), lime, guava.
- **Coconut Margarita** — Patrón Silver Tequila, triple sec (orange liqueur), lime, coconut.

### Wine by the glass

- Archer Roose Sauvignon Blanc
- Archer Roose Pinot Noir
- Archer Roose Rosé
- Archer Roose Sparkling

### Beer

- Bud Light
- Budweiser
- Coors Light
- Michelob Ultra
- Corona Extra
- Heineken
- Heineken Silver
- Lagunitas IPA
- Peroni Nastro Azzurro
- Red Stripe
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Truly Hard Seltzer
- Angry Orchard cider
- Sun Cruiser Iced Tea Vodka
- Sprinter Black Cherry
- Sprinter Grapefruit
- Sprinter Lime
- Sprinter Peach

## Star Bar (Deck 18)

- **Source:** `Star_Princess_Pool_Bar.pdf`
- **Evidence:** Shared Star Princess Pool Bar PDF used as *inferred*, less-verified Star Bar substitute. Venue-specific selection not independently established; do not assume every cocktail is sold here.
- **Price eligibility:** CONFIRMED — all entries below were priced at $15 or less on this menu

### Cocktails

- **Passion Satisfaction** — Crossfire Rum, Licor 43 (vanilla-citrus liqueur), honey, fresh lime, passion fruit, pineapple, Angostura bitters.
- **Sweetest Sounds** — Crossfire Rum, amaretto (almond-flavored liqueur), coconut, fresh lime, ginger.
- **Honey Sweet Bourbon** — Brother's Bond Bourbon, Aperol (bitter-orange aperitif), peach purée, honey, lemon.
- **Southern Bond** — Brother's Bond Bourbon, Malibu Coconut Rum, mango, coconut milk, lime, mint.
- **Meili Paloma 2.0** — Meili Vodka, fresh lime juice, agave, jalapeños, Betty Buzz grapefruit soda.
- **Hampton Spritz** — Hampton Water Bubbly Rosé (sparkling rosé wine), elderflower liqueur, fresh lime, mint, raspberries, Betty Buzz sparkling grapefruit.
- **24K Margarita** — Pantalones Tequila, Cointreau (orange liqueur), Grand Marnier (orange liqueur), lemon, lime.
- **Frosé** — Tito's Handmade Vodka, Hampton Water Rosé, strawberry, pear.
- **Truly Caliente Fresca** — Truly Strawberry Lemonade, Patrón Silver Tequila, lime, jalapeños, mint.
- **Truly Pineapple & Coconut Daiquiri** — Truly Hard Seltzer Pineapple, Malibu Rum, coconut, orgeat (almond syrup).
- **Jungle Bird** — Bacardi White Rum, Bacardi Spiced Rum, Campari (bitter herbal aperitif), lime, pineapple.
- **Lychee Vodka Mojito** — Tito's Handmade Vodka, lychee, fresh mint, lime.
- **Peanut Jungle Ball** — Skrewball Peanut Butter Whiskey (peanut-butter-flavored whiskey), Campari (bitter herbal aperitif), falernum, orgeat (almond syrup), lemon, lime, dark rum float.
- **Can't Feel the Rain** — Ketel One Vodka, peach, pineapple, lemon, honey.
- **Tropical Alibi** — Sláinte Irish Whiskey, banana liqueur, coconut milk, pineapple, fresh lime, Angostura bitters.
- **Frozen Aperol Spritz** — Aperol (bitter-orange aperitif), Prosecco, orange, club soda.
- **Guava Margarita** — Patrón Silver Tequila, Cointreau (orange liqueur), lime, guava.
- **Coconut Margarita** — Patrón Silver Tequila, triple sec (orange liqueur), lime, coconut.

### Wine by the glass

- Archer Roose Sauvignon Blanc
- Archer Roose Pinot Noir
- Archer Roose Rosé
- Archer Roose Sparkling

### Beer

- Bud Light
- Budweiser
- Coors Light
- Michelob Ultra
- Corona Extra
- Heineken
- Heineken Silver
- Lagunitas IPA
- Peroni Nastro Azzurro
- Red Stripe
- Stella Artois

### Cider, hard seltzer and ready-to-drink alcohol

- Truly Hard Seltzer
- Angry Orchard cider
- Sun Cruiser Iced Tea Vodka
- Sprinter Black Cherry
- Sprinter Grapefruit
- Sprinter Lime
- Sprinter Peach

---

## Source notes and limits

- All 13 bar sections are above. The four pool-related sections deliberately repeat the same source menu.
- A shared, generic Princess bar menu and a generic pool-bar sample PDF in the ZIP were not used to add drinks: they could introduce unverified ship/bar offerings. The International Café PDF was excluded because that venue is outside the agreed 13-bar game.
- The O'Malley's PDF does not list beer or wine, and the Good Spirits PDF does not list beer or wine; nothing has been invented to fill those absences.
- The by-the-glass wines with listed prices above $15 (generally marked 'Premier') have been excluded. Nonalcoholic sparkling rosé and Heineken 0.0 were excluded too.
- Because Good Spirits has no prices, it is the only source here containing **unverified price-eligibility** cocktails.
