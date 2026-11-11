/**
 * Stable-key reconciliation from interim working catalog → FINAL locked catalog.
 *
 * Rules:
 * - Preserve stable keys when the underlying condition is the same (or a finalized rename).
 * - Retire obsolete duplicates that are not in the final 174.
 * - Add new keys only for genuinely new definitions.
 * - Never invent creative content; titles/triggers/icons/secrets come from the MD authority.
 */

/** Final Drink It! / Ship It! category → DB achievement_group */
export const FINAL_CATEGORY_TO_GROUP = {
  drinkit: {
    'Drinking with Davids': 'drinking_with_davids',
    'Firsts & Early Wins': 'firsts_early_wins',
    'Bounties & Competition': 'bounties_competition',
    'Bars & Exploration': 'bars_exploration',
    'Spirits & Ingredients': 'spirits_ingredients',
    'Friends & Social': 'friends_social',
    'Ship-Time & Cruise Milestones': 'ship_time_milestones',
    'Collections & Bar Gauntlets': 'bar_gauntlets',
  },
  shipit: {
    'Progress & Completion': 'progress_completion',
    'Ship-Time & Cruise Milestones': 'ship_time_milestones',
    'Challenge Spotlights': 'challenge_spotlights',
    'First to Find': 'firsts',
  },
}

/** Pool-deck / pool bars used by Davids pool-bar achievements */
export const POOL_BAR_KEYS = ['lido-bar', 'the-mix', 'promenade-bars', 'star-bar']

/**
 * Map final achievement name → existing stableKey (when retained).
 * Names must match the FINAL authority exactly.
 */
export const FINAL_NAME_TO_STABLE_KEY = {
  // —— Drink It! Drinking with Davids ——
  'Wasted Away Again In Margaritaville': 'working-drinkit-dwd-margarita-kickoff',
  'Tampico Trauma': 'working-drinkit-dwd-tampico-trauma', // NEW
  'When the Volcano Blows': 'working-drinkit-dwd-fireball-shot',
  'Desperation Sambuca': 'working-drinkit-dwd-sambuca-shot',
  'The Night I Painted the Sky': 'working-drinkit-dwd-sunset-toast',
  'Jimmy Buffett Toast': 'working-drinkit-dwd-jimmy-buffett-toast',

  // —— Firsts & Early Wins ——
  'Bon Voyage!': 'working-drinkit-d001',
  "Third Time's the Charm": 'working-drinkit-d002',
  'Light Work': 'working-drinkit-d003',
  '15 Minutes of Fame': 'working-drinkit-d004',
  'The AA meeting is Wednesday': 'working-drinkit-d005',
  'Bounty Hunting': 'working-drinkit-d006',
  'One Particular Cocktail': 'working-drinkit-d007',
  'Elementary, My Dear Watson': 'working-drinkit-d008',
  'This Round is on Me': 'working-drinkit-d009',
  'Your mission should you choose to accept it': 'working-drinkit-d010',
  'Gotta Start Somewhere': 'working-drinkit-d028',

  // —— Bounties & Competition ——
  'Double Kill': 'working-drinkit-d011',
  'This shouldn’t be possible!!': 'working-drinkit-d012',
  'Try Harding': 'working-drinkit-d013',
  'Its a marathon, not a Sprint': 'working-drinkit-d014',
  'Three Sheets to the Wind': 'working-drinkit-d015',
  'Barometer Soup': 'working-drinkit-d016',
  'The Pascagoula Run': 'working-drinkit-d017',
  'Four of a Kind': 'working-drinkit-d018',
  'So Nice I had it twice': 'working-drinkit-d031',
  'Take it to the limit': 'working-drinkit-d085',
  'All Hands on Deck': 'working-drinkit-d094', // NEW
  'Seven Days, Seven Ways': 'working-drinkit-d095', // NEW

  // —— Bars & Exploration ——
  'Bar None': 'working-drinkit-d019',
  'Changes in Latitudes, Changes in Attitudes': 'working-drinkit-d020',
  'Life Is a Highway': 'working-drinkit-d021',
  "I've Been Everywhere, Man": 'working-drinkit-d022',
  'Its kind of a Triathlon': 'working-drinkit-d023',
  'Repeat Offender': 'working-drinkit-d024',
  'I’ll have what I’m having': 'working-drinkit-d025',
  "Three's Company": 'working-drinkit-d026',
  'It’s called “Branching out”': 'working-drinkit-d029',
  'They Serve Other Stuff Here': 'working-drinkit-d030',
  'Stuck in Colder Weather': 'working-drinkit-d033',
  'Red, Red Wine': 'working-drinkit-d034',
  'One of Each, Please': 'working-drinkit-d036',
  'Where everyone knows my name': 'working-drinkit-d079',
  'Not a worry in the world, cold beer in my hand': 'working-drinkit-d080',
  'The menu is more of a “guideline” anyway': 'working-drinkit-d084',

  // —— Spirits & Ingredients ——
  'The Gintleman': 'working-drinkit-d037',
  'Tequila Mockingbird': 'working-drinkit-d038',
  'Rum, Forrest, Rum!': 'working-drinkit-d039',
  'Whiskey Business': 'working-drinkit-d040',
  'Crystal Clear': 'working-drinkit-d041',
  'Paint It Black': 'working-drinkit-d042',
  'The Fantastic Four': 'working-drinkit-d043',
  'Tastes like a Campfire': 'working-drinkit-d044',
  'Easy Peasy Lemon Squeezy': 'working-drinkit-d045',
  'Pineapple Express': 'working-drinkit-d046',
  'Heard it on the Coconut Telegraph': 'working-drinkit-d047',
  'Orange You Glad?': 'working-drinkit-d048',
  'How do you milk an almond?': 'working-drinkit-d049',
  'That’s a Spicy Meatball!': 'working-drinkit-d050',
  'Wake Me Up Before You Go-Go': 'working-drinkit-d051',
  'Flower Power': 'working-drinkit-d052',
  'Almond Joy': 'working-drinkit-d053',
  'Fa-la-la-la Falernum': 'working-drinkit-d054',
  'Last Lychee in Paris': 'working-drinkit-d055',
  'We aren’t even going to that island!': 'working-drinkit-d056',
  'Peanut Butter Conspiracy': 'working-drinkit-d057',
  'Beet It': 'working-drinkit-d058',
  'Grease Is the Word': 'working-drinkit-d059',
  'Bitter Sweet Symphony': 'working-drinkit-d060',
  'Anyone got the Thyme?': 'working-drinkit-d061',
  'Kitchen Sink Drink': 'working-drinkit-d062',
  'Double Trouble': 'working-drinkit-d063',
  'Little a this, little a that': 'working-drinkit-d064',
  'The Wine makes it Classy': 'working-drinkit-d065',
  'Fruitcakes in the kitchen': 'working-drinkit-d066',
  "Bananaday Dreamin'": 'working-drinkit-d096', // NEW

  // —— Friends & Social ——
  "Three's a Crowd": 'working-drinkit-d067',
  'We Are the People Our Parents Warned Us About': 'working-drinkit-d068',
  'Drinking on Lunch Break': 'working-drinkit-d069',
  'With a Little Help from My Friends': 'working-drinkit-d070',
  'Road Trip!': 'working-drinkit-d071',
  'Wrinkles only go where the smiles have been': 'working-drinkit-d082',
  'Something something alcohol tolerance': 'working-drinkit-d087',
  "At Least it isn't coors lite": 'working-drinkit-d089',
  'Feeding the Fishes': 'working-drinkit-d090',
  'This is too sweet for me': 'working-drinkit-d091',
  'The Wino and I know': 'working-drinkit-d092',
  'Dear Maria, Count me Gin': 'working-drinkit-d093',
  'One Peppy Lopez, Please.': 'working-drinkit-d086',
  'A Pirate Looks at 40': 'working-drinkit-d088',

  // —— Ship-Time & Cruise Milestones (Drink It!) ——
  "You Can't Drink All Day Unless You Start in the Morning": 'working-drinkit-d072',
  'Working on the Night Moves': 'working-drinkit-d073',
  'Slamma Jamma': 'working-drinkit-d074',
  'Weather Is Here, Wish You Were Beautiful': 'working-drinkit-d075',
  'Come Sail Away': 'working-drinkit-d076',
  "It's Been a Lovely Cruise": 'working-drinkit-d077',
  'The Days Drift By': 'working-drinkit-d078',
  'Dawn of the Peck': 'working-drinkit-d081',

  // —— Collections & Bar Gauntlets ——
  'Frozen Concoctions': 'working-drinkit-frozen-concoctions', // NEW
  'License to Chill': 'working-drinkit-license-to-chill', // NEW
  'Lido Shuffle': 'working-drinkit-gauntlet-personal-lido-bar',
  "Screamin' Boat Drinks": 'working-drinkit-gauntlet-collective-lido-bar',
  'The MIX Tape': 'working-drinkit-gauntlet-personal-the-mix',
  'MIX Tape Masters': 'working-drinkit-gauntlet-collective-the-mix',
  'The Daiquiri is too Fruitiful': 'working-drinkit-gauntlet-personal-promenade-bars',
  'Promenade Pirates': 'working-drinkit-gauntlet-collective-promenade-bars',
  'Super Star!': 'working-drinkit-gauntlet-personal-star-bar',
  'Stars on the Water': 'working-drinkit-gauntlet-collective-star-bar',
  'Spirited Away': 'working-drinkit-gauntlet-personal-good-spirits-at-sea', // NEW def
  'Former Spirit Airlines Flight Crew':
    'working-drinkit-gauntlet-collective-good-spirits-at-sea', // NEW def
  'Luck of the Irish': 'working-drinkit-gauntlet-personal-omalleys-irish-pub',
  'The Whole Paddy Wagon': 'working-drinkit-gauntlet-collective-omalleys-irish-pub',
  'Live and Let Drink': 'working-drinkit-gauntlet-personal-princess-live',
  'Just here for the Karaoke': 'working-drinkit-gauntlet-collective-princess-live',
  'Bellini There, Done That': 'working-drinkit-gauntlet-personal-bellinis-cocktail-bar',
  'The Bellini Bunch': 'working-drinkit-gauntlet-collective-bellinis-cocktail-bar',
  'Steady as She Goes': 'working-drinkit-gauntlet-personal-wheelhouse-bar',
  'Wheelhouse Rock': 'working-drinkit-gauntlet-collective-wheelhouse-bar',
  'I did it My Way': 'working-drinkit-gauntlet-personal-crooners',
  'The Rat Pack': 'working-drinkit-gauntlet-collective-crooners',
  'View to Thrill': 'working-drinkit-gauntlet-personal-wake-view-bar',
  'We like a nice Aft': 'working-drinkit-gauntlet-collective-wake-view-bar',
  'Son of a Son of a Sailor': 'working-drinkit-gauntlet-personal-sea-view-bar',
  'The Coral Reefers': 'working-drinkit-gauntlet-collective-sea-view-bar',
  'Chasing Waterfalls': 'working-drinkit-gauntlet-personal-cascade-bar',
  'The Ripple Effect': 'working-drinkit-gauntlet-collective-cascade-bar',

  // —— Ship It! Progress & Completion ——
  'The Start of Something New': 'working-shipit-s001',
  'We’re just getting started baby': 'working-shipit-s002',
  'Double Digits': 'working-shipit-s003',
  'Cant Stop Won’t Stop': 'working-shipit-s004',
  "Whoaaaa We're Halfway There": 'working-shipit-s005',
  'Ah The Stories We Could Tell': 'working-shipit-s006',
  "Gotta Catch 'Em All!": 'working-shipit-s007',
  'Finders Keepers': 'working-shipit-s008',

  // —— Ship It! Ship-Time ——
  'The Early Bird Special': 'working-shipit-s009',
  'Night Moves': 'working-shipit-s010',
  'You don’t get extra credit': 'working-shipit-s011',
  'The Love Boat': 'working-shipit-s012',
  'Under The Wire': 'working-shipit-s013',
  'Why are you even on the ship?': 'working-shipit-s014',
  'Same Ship, Different Day': 'working-shipit-s015',
  'The Fast & The Curious': 'working-shipit-s016',

  // —— Ship It! Challenge Spotlights ——
  'Wax On, Wax Off': 'working-shipit-s017',
  'Cultural Infidel': 'working-shipit-s018',
  'Eye of the Tiger': 'working-shipit-s019',
  'Hot & Ready': 'working-shipit-s020',
  'You Scream I Scream': 'working-shipit-s021',
  'Buffet the Vampire Slayer': 'working-shipit-s022',
  'If You Like Piña Coladas': 'working-shipit-s023',
  'The Breakfast Club': 'working-shipit-s024',
  'The Safety Dance': 'working-shipit-s025',
  'Animal House': 'working-shipit-s026',
  'Jolly Mon Sing': 'working-shipit-s027',
  // Drink It! also has Wake Me Up — Ship It! keeps S-028
  // Handled specially below for game-scoped maps
  'Fins Up!': 'working-shipit-s029',
  'My Whole Life Is Waiting Behind Door Number 3': 'working-shipit-s030',
  'We Build this Ship on Rock and Roll': 'working-shipit-s031',
  Footloose: 'working-shipit-s032',
  'We Came, We Saw, We Souvenired': 'working-shipit-s033',
  "Don't Let the Sun Go Down on Me": 'working-shipit-s034',
  "I'm Flying, Jack!": 'working-shipit-s035',
  'The Three Amigos': 'working-shipit-s036',
  'Full House': 'working-shipit-s037',
  'Where in the World Is Carmen Sandiego?': 'working-shipit-s038',
  'My own kind of paradise': 'working-shipit-s048',

  // —— Ship It! First to Find ——
  'Honey, I Shrunk the Ship': 'working-shipit-s039',
  'Irish You Were Here': 'working-shipit-s040',
  'Spirit in the Sky': 'working-shipit-s041',
  'North by Northwest': 'working-shipit-s042',
  'Every Rose Has Its Thorn': 'working-shipit-s043',
  'Friday the 13th': 'working-shipit-s044',
  'Shadow Dancing': 'working-shipit-s045',
  'Hawaii Five-O!': 'working-shipit-s046',
  'Get The Broom Out Cause That’s a Sweep!': 'working-shipit-s047',
}

/** Game-scoped overrides when the same title exists in both games. */
export const FINAL_NAME_GAME_STABLE_KEY = {
  'drinkit|Wake Me Up Before You Go-Go': 'working-drinkit-d051',
  'shipit|Wake Me Up Before You Go-Go': 'working-shipit-s028',
  'shipit|If You Like Piña Coladas': 'working-shipit-s023',
}

/** Obsolete active definitions not present in the final catalog (disable, keep history). */
export const RETIRE_STABLE_KEYS = [
  'working-drinkit-d032', // Off the Beaten Path — superseded by D-084 guideline title
  'working-drinkit-d035', // Can’t beat the classics — duplicate beer of D-080
  'working-drinkit-d083', // Screamin' Boat Drinks placeholder — now Lido collective gauntlet
]

/** Snapshot refs for new definitions */
export const NEW_SNAPSHOT_REFS = {
  'working-drinkit-dwd-tampico-trauma': 'FINAL-DWD-006',
  'working-drinkit-d094': 'FINAL-D-094',
  'working-drinkit-d095': 'FINAL-D-095',
  'working-drinkit-d096': 'FINAL-D-096',
  'working-drinkit-frozen-concoctions': 'FINAL-FROZEN-001',
  'working-drinkit-license-to-chill': 'FINAL-FROZEN-002',
  'working-drinkit-gauntlet-personal-good-spirits-at-sea': 'FINAL-BG-P-good-spirits-at-sea',
  'working-drinkit-gauntlet-collective-good-spirits-at-sea': 'FINAL-BG-C-good-spirits-at-sea',
}

export function resolveStableKey(finalRow) {
  const scoped = FINAL_NAME_GAME_STABLE_KEY[`${finalRow.game}|${finalRow.name}`]
  if (scoped) return scoped
  const key = FINAL_NAME_TO_STABLE_KEY[finalRow.name]
  if (!key) {
    throw new Error(`No stable-key mapping for ${finalRow.game}: ${finalRow.name}`)
  }
  return key
}

export function groupKeyFor(finalRow) {
  const map = FINAL_CATEGORY_TO_GROUP[finalRow.game]
  const group = map?.[finalRow.category]
  if (!group) {
    throw new Error(`No group_key for ${finalRow.game}/${finalRow.category}`)
  }
  return group
}
