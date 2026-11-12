/**
 * Central Font Awesome Pro icon registry (04-UI-Content-and-Icons.md §13).
 *
 * - Pro Light → outline / inactive controls
 * - Pro Solid → active / completed / emphasis
 * - Pro Regular available for denser mobile UI when Light reads too thin
 *
 * Install requires FONTAWESOME_PACKAGE_TOKEN (Package Token, not API/Kit).
 * Never commit the token. Never expose it via VITE_ variables.
 */
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { library } from '@fortawesome/fontawesome-svg-core'
import {
  faArrowLeft as falArrowLeft,
  faArrowRight as falArrowRight,
  faAward as falAward,
  faBeerMug as falBeerMug,
  faBellConcierge as falBellConcierge,
  faBinoculars as falBinoculars,
  faBolt as falBolt,
  faBottleDroplet as falBottleDroplet,
  faBrain as falBrain,
  faBullseye as falBullseye,
  faCakeCandles as falCakeCandles,
  faCalendarDay as falCalendarDay,
  faCamera as falCamera,
  faChair as falChair,
  faChevronDown as falChevronDown,
  faChevronRight as falChevronRight,
  faChildren as falChildren,
  faCircle as falCircle,
  faCircleCheck as falCircleCheck,
  faCircleDot as falCircleDot,
  faCircleInfo as falCircleInfo,
  faCircleQuestion as falCircleQuestion,
  faClipboardList as falClipboardList,
  faClock as falClock,
  faCloudSun as falCloudSun,
  faCompass as falCompass,
  faDice as falDice,
  faDoorClosed as falDoorClosed,
  faDownload as falDownload,
  faElevator as falElevator,
  faFaceSleeping as falFaceSleeping,
  faFilm as falFilm,
  faFire as falFire,
  faGem as falGem,
  faGift as falGift,
  faHandshake as falHandshake,
  faHouse as falHouse,
  faIceCream as falIceCream,
  faImage as falImage,
  faImages as falImages,
  faLandmarkDome as falLandmarkDome,
  faLayerGroup as falLayerGroup,
  faLeaf as falLeaf,
  faLemon as falLemon,
  faLifeRing as falLifeRing,
  faListCheck as falListCheck,
  faLocationDot as falLocationDot,
  faLock as falLock,
  faLockOpen as falLockOpen,
  faMagnifyingGlass as falMagnifyingGlass,
  faMap as falMap,
  faMasksTheater as falMasksTheater,
  faMartiniGlass as falMartiniGlass,
  faMartiniGlassCitrus as falMartiniGlassCitrus,
  faMedal as falMedal,
  faMicrophone as falMicrophone,
  faMoon as falMoon,
  faMugHot as falMugHot,
  faMusic as falMusic,
  faPalette as falPalette,
  faPause as falPause,
  faPaw as falPaw,
  faPen as falPen,
  faPeopleGroup as falPeopleGroup,
  faPepperHot as falPepperHot,
  faPersonFalling as falPersonFalling,
  faPersonRays as falPersonRays,
  faPersonRunning as falPersonRunning,
  faPizzaSlice as falPizzaSlice,
  faPlay as falPlay,
  faRepeat as falRepeat,
  faRoute as falRoute,
  faRotate as falRotate,
  faRotateRight as falRotateRight,
  faShip as falShip,
  faShirt as falShirt,
  faSnowflake as falSnowflake,
  faSpa as falSpa,
  faSparkles as falSparkles,
  faSquare as falSquare,
  faSquarePlus as falSquarePlus,
  faStairs as falStairs,
  faStar as falStar,
  faSun as falSun,
  faTicket as falTicket,
  faTrash as falTrash,
  faTreePalm as falTreePalm,
  faTriangleExclamation as falTriangleExclamation,
  faTrophy as falTrophy,
  faUmbrellaBeach as falUmbrellaBeach,
  faUserSecret as falUserSecret,
  faUserTie as falUserTie,
  faUsers as falUsers,
  faUtensils as falUtensils,
  faWater as falWater,
  faWhiskeyGlass as falWhiskeyGlass,
  faWind as falWind,
  faWineGlass as falWineGlass,
  faXmark as falXmark,
} from '@fortawesome/pro-light-svg-icons'
import {
  faArrowLeft as fasArrowLeft,
  faArrowRight as fasArrowRight,
  faAward as fasAward,
  faBadgeCheck as fasBadgeCheck,
  faBeerMug as fasBeerMug,
  faBellConcierge as fasBellConcierge,
  faBinoculars as fasBinoculars,
  faBolt as fasBolt,
  faBottleDroplet as fasBottleDroplet,
  faBrain as fasBrain,
  faBullseye as fasBullseye,
  faCakeCandles as fasCakeCandles,
  faCalendarDay as fasCalendarDay,
  faCamera as fasCamera,
  faChair as fasChair,
  faChevronDown as fasChevronDown,
  faChevronRight as fasChevronRight,
  faChildren as fasChildren,
  faCircle as fasCircle,
  faCircleCheck as fasCircleCheck,
  faCircleDot as fasCircleDot,
  faCircleInfo as fasCircleInfo,
  faCircleQuestion as fasCircleQuestion,
  faClipboardList as fasClipboardList,
  faClock as fasClock,
  faCloudSun as fasCloudSun,
  faCompass as fasCompass,
  faDice as fasDice,
  faDoorClosed as fasDoorClosed,
  faDownload as fasDownload,
  faElevator as fasElevator,
  faFaceSleeping as fasFaceSleeping,
  faFilm as fasFilm,
  faFire as fasFire,
  faGem as fasGem,
  faGift as fasGift,
  faHandshake as fasHandshake,
  faHouse as fasHouse,
  faIceCream as fasIceCream,
  faImage as fasImage,
  faImages as fasImages,
  faLandmarkDome as fasLandmarkDome,
  faLayerGroup as fasLayerGroup,
  faLeaf as fasLeaf,
  faLemon as fasLemon,
  faLifeRing as fasLifeRing,
  faListCheck as fasListCheck,
  faLocationDot as fasLocationDot,
  faLock as fasLock,
  faLockOpen as fasLockOpen,
  faMagnifyingGlass as fasMagnifyingGlass,
  faMap as fasMap,
  faMasksTheater as fasMasksTheater,
  faMartiniGlass as fasMartiniGlass,
  faMartiniGlassCitrus as fasMartiniGlassCitrus,
  faMedal as fasMedal,
  faMicrophone as fasMicrophone,
  faMoon as fasMoon,
  faMugHot as fasMugHot,
  faMusic as fasMusic,
  faPalette as fasPalette,
  faPause as fasPause,
  faPaw as fasPaw,
  faPen as fasPen,
  faPeopleGroup as fasPeopleGroup,
  faPepperHot as fasPepperHot,
  faPersonFalling as fasPersonFalling,
  faPersonRays as fasPersonRays,
  faPersonRunning as fasPersonRunning,
  faPizzaSlice as fasPizzaSlice,
  faPlay as fasPlay,
  faRepeat as fasRepeat,
  faRoute as fasRoute,
  faRotate as fasRotate,
  faRotateRight as fasRotateRight,
  faShip as fasShip,
  faShirt as fasShirt,
  faSnowflake as fasSnowflake,
  faSparkles as fasSparkles,
  faSpa as fasSpa,
  faSquare as fasSquare,
  faSquarePlus as fasSquarePlus,
  faStairs as fasStairs,
  faStar as fasStar,
  faSun as fasSun,
  faTicket as fasTicket,
  faTrash as fasTrash,
  faTreePalm as fasTreePalm,
  faTriangleExclamation as fasTriangleExclamation,
  faTrophy as fasTrophy,
  faUmbrellaBeach as fasUmbrellaBeach,
  faUserSecret as fasUserSecret,
  faUserTie as fasUserTie,
  faUsers as fasUsers,
  faUtensils as fasUtensils,
  faWater as fasWater,
  faWhiskeyGlass as fasWhiskeyGlass,
  faWind as fasWind,
  faWineGlass as fasWineGlass,
  faXmark as fasXmark,
} from '@fortawesome/pro-solid-svg-icons'

export type IconStyle = 'outline' | 'solid'

export type SemanticIconKey =
  | 'nav.home'
  | 'nav.action'
  | 'nav.gallery'
  | 'nav.achievements'
  | 'nav.wrapped'
  | 'header.switch-game'
  | 'header.back'
  | 'action.next'
  | 'action.close'
  | 'action.expand'
  | 'action.open-row'
  | 'action.search'
  | 'action.camera'
  | 'action.photo'
  | 'action.download'
  | 'action.retry'
  | 'action.play'
  | 'action.pause'
  | 'action.edit'
  | 'action.remove'
  | 'status.selected'
  | 'status.completed'
  | 'status.incomplete'
  | 'status.unselected'
  | 'status.locked'
  | 'status.unlocked'
  | 'status.sparkles'
  | 'status.time'
  | 'status.asleep'
  | 'status.info'
  | 'status.warning'
  | 'theme.drink-it'
  | 'theme.ship-it'
  | 'score.leaderboard'
  | 'score.achievement'
  | 'score.medal'
  | 'score.points'
  | 'score.bar'
  | 'score.friends'
  | 'score.team'
  | 'score.calendar'
  | 'score.list'
  | 'score.clock'
  | 'score.compass'
  | 'score.bolt'
  | 'score.bullseye'
  | 'score.snowflake'
  | 'score.wine'
  | 'score.beer'
  | 'score.layer'
  | 'score.cocktail'
  | 'score.pepper'
  | 'score.palm'
  | 'score.whiskey'
  | 'score.bottle'
  | 'score.fire'
  | 'score.lemon'
  | 'score.coffee'
  | 'score.sun'
  | 'score.moon'
  | 'score.repeat'
  | 'score.camera'
  | 'score.music'
  | 'score.beach'
  | 'score.route'
  | 'score.utensils'
  | 'score.gem'
  | 'score.flower'
  | 'score.leaf'
  | 'score.secret'
  // Ship It! challenge content icons (Phase S4) — used by challenge card mapping
  | 'shipit.stairs'
  | 'shipit.film'
  | 'shipit.dome'
  | 'shipit.spa'
  | 'shipit.theater'
  | 'shipit.dice'
  | 'shipit.palette'
  | 'shipit.concierge'
  | 'shipit.pizza'
  | 'shipit.ice-cream'
  | 'shipit.cake'
  | 'shipit.door'
  | 'shipit.elevator'
  | 'shipit.life-ring'
  | 'shipit.mystery'
  | 'shipit.paw'
  | 'shipit.microphone'
  | 'shipit.water'
  | 'shipit.clipboard'
  | 'shipit.handshake'
  | 'shipit.captain'
  | 'shipit.brain'
  | 'shipit.binoculars'
  | 'shipit.fitness'
  | 'shipit.ticket'
  | 'shipit.gift'
  | 'shipit.children'
  | 'shipit.wind'
  | 'shipit.sunset'
  | 'shipit.pose'
  | 'shipit.shirt'
  | 'shipit.jump'
  | 'shipit.chair'
  | 'shipit.map'

type IconPair = {
  outline: IconDefinition
  solid: IconDefinition
}

const registry: Record<SemanticIconKey, IconPair> = {
  'nav.home': { outline: falHouse, solid: fasHouse },
  'nav.action': { outline: falSquarePlus, solid: fasSquarePlus },
  'nav.gallery': { outline: falImages, solid: fasImages },
  'nav.achievements': { outline: falStar, solid: fasStar },
  'nav.wrapped': { outline: falAward, solid: fasAward },
  'header.switch-game': { outline: falRotate, solid: fasRotate },
  'header.back': { outline: falArrowLeft, solid: fasArrowLeft },
  'action.next': { outline: falArrowRight, solid: fasArrowRight },
  'action.close': { outline: falXmark, solid: fasXmark },
  'action.expand': { outline: falChevronDown, solid: fasChevronDown },
  'action.open-row': { outline: falChevronRight, solid: fasChevronRight },
  'action.search': { outline: falMagnifyingGlass, solid: fasMagnifyingGlass },
  'action.camera': { outline: falCamera, solid: fasCamera },
  'action.photo': { outline: falImage, solid: fasImage },
  'action.download': { outline: falDownload, solid: fasDownload },
  'action.retry': { outline: falRotateRight, solid: fasRotateRight },
  'action.play': { outline: falPlay, solid: fasPlay },
  'action.pause': { outline: falPause, solid: fasPause },
  'action.edit': { outline: falPen, solid: fasPen },
  'action.remove': { outline: falTrash, solid: fasTrash },
  'status.selected': { outline: falCircleCheck, solid: fasBadgeCheck },
  'status.completed': { outline: falCircleCheck, solid: fasCircleCheck },
  'status.sparkles': { outline: falSparkles, solid: fasSparkles },
  'status.incomplete': { outline: falCircle, solid: fasCircle },
  'status.unselected': { outline: falSquare, solid: fasSquare },
  'status.locked': { outline: falLock, solid: fasLock },
  'status.unlocked': { outline: falLockOpen, solid: fasLockOpen },
  'status.time': { outline: falClock, solid: fasClock },
  'status.asleep': { outline: falFaceSleeping, solid: fasFaceSleeping },
  'status.info': { outline: falCircleInfo, solid: fasCircleInfo },
  'status.warning': { outline: falTriangleExclamation, solid: fasTriangleExclamation },
  'theme.drink-it': { outline: falMartiniGlass, solid: fasMartiniGlass },
  'theme.ship-it': { outline: falShip, solid: fasShip },
  'score.leaderboard': { outline: falTrophy, solid: fasTrophy },
  'score.achievement': { outline: falAward, solid: fasAward },
  'score.medal': { outline: falMedal, solid: fasMedal },
  'score.points': { outline: falCircleDot, solid: fasCircleDot },
  'score.bar': { outline: falLocationDot, solid: fasLocationDot },
  'score.friends': { outline: falUsers, solid: fasUsers },
  'score.team': { outline: falPeopleGroup, solid: fasPeopleGroup },
  'score.calendar': { outline: falCalendarDay, solid: fasCalendarDay },
  'score.list': { outline: falListCheck, solid: fasListCheck },
  'score.clock': { outline: falClock, solid: fasClock },
  'score.compass': { outline: falCompass, solid: fasCompass },
  'score.bolt': { outline: falBolt, solid: fasBolt },
  'score.bullseye': { outline: falBullseye, solid: fasBullseye },
  'score.snowflake': { outline: falSnowflake, solid: fasSnowflake },
  'score.wine': { outline: falWineGlass, solid: fasWineGlass },
  'score.beer': { outline: falBeerMug, solid: fasBeerMug },
  'score.layer': { outline: falLayerGroup, solid: fasLayerGroup },
  'score.cocktail': { outline: falMartiniGlassCitrus, solid: fasMartiniGlassCitrus },
  'score.pepper': { outline: falPepperHot, solid: fasPepperHot },
  'score.palm': { outline: falTreePalm, solid: fasTreePalm },
  'score.whiskey': { outline: falWhiskeyGlass, solid: fasWhiskeyGlass },
  'score.bottle': { outline: falBottleDroplet, solid: fasBottleDroplet },
  'score.fire': { outline: falFire, solid: fasFire },
  'score.lemon': { outline: falLemon, solid: fasLemon },
  'score.coffee': { outline: falMugHot, solid: fasMugHot },
  'score.sun': { outline: falSun, solid: fasSun },
  'score.moon': { outline: falMoon, solid: fasMoon },
  'score.repeat': { outline: falRepeat, solid: fasRepeat },
  'score.camera': { outline: falCamera, solid: fasCamera },
  'score.music': { outline: falMusic, solid: fasMusic },
  'score.beach': { outline: falUmbrellaBeach, solid: fasUmbrellaBeach },
  'score.route': { outline: falRoute, solid: fasRoute },
  'score.utensils': { outline: falUtensils, solid: fasUtensils },
  'score.gem': { outline: falGem, solid: fasGem },
  'score.flower': { outline: falLeaf, solid: fasLeaf },
  'score.leaf': { outline: falLeaf, solid: fasLeaf },
  'score.secret': { outline: falUserSecret, solid: fasUserSecret },
  'shipit.stairs': { outline: falStairs, solid: fasStairs },
  'shipit.film': { outline: falFilm, solid: fasFilm },
  'shipit.dome': { outline: falLandmarkDome, solid: fasLandmarkDome },
  'shipit.spa': { outline: falSpa, solid: fasSpa },
  'shipit.theater': { outline: falMasksTheater, solid: fasMasksTheater },
  'shipit.dice': { outline: falDice, solid: fasDice },
  'shipit.palette': { outline: falPalette, solid: fasPalette },
  'shipit.concierge': { outline: falBellConcierge, solid: fasBellConcierge },
  'shipit.pizza': { outline: falPizzaSlice, solid: fasPizzaSlice },
  'shipit.ice-cream': { outline: falIceCream, solid: fasIceCream },
  'shipit.cake': { outline: falCakeCandles, solid: fasCakeCandles },
  'shipit.door': { outline: falDoorClosed, solid: fasDoorClosed },
  'shipit.elevator': { outline: falElevator, solid: fasElevator },
  'shipit.life-ring': { outline: falLifeRing, solid: fasLifeRing },
  'shipit.mystery': { outline: falCircleQuestion, solid: fasCircleQuestion },
  'shipit.paw': { outline: falPaw, solid: fasPaw },
  'shipit.microphone': { outline: falMicrophone, solid: fasMicrophone },
  'shipit.water': { outline: falWater, solid: fasWater },
  'shipit.clipboard': { outline: falClipboardList, solid: fasClipboardList },
  'shipit.handshake': { outline: falHandshake, solid: fasHandshake },
  'shipit.captain': { outline: falUserTie, solid: fasUserTie },
  'shipit.brain': { outline: falBrain, solid: fasBrain },
  'shipit.binoculars': { outline: falBinoculars, solid: fasBinoculars },
  'shipit.fitness': { outline: falPersonRunning, solid: fasPersonRunning },
  'shipit.ticket': { outline: falTicket, solid: fasTicket },
  'shipit.gift': { outline: falGift, solid: fasGift },
  'shipit.children': { outline: falChildren, solid: fasChildren },
  'shipit.wind': { outline: falWind, solid: fasWind },
  'shipit.sunset': { outline: falCloudSun, solid: fasCloudSun },
  'shipit.pose': { outline: falPersonRays, solid: fasPersonRays },
  'shipit.shirt': { outline: falShirt, solid: fasShirt },
  'shipit.jump': { outline: falPersonFalling, solid: fasPersonFalling },
  'shipit.chair': { outline: falChair, solid: fasChair },
  'shipit.map': { outline: falMap, solid: fasMap },
}

const registered = new Set<string>()

function ensureRegistered(icon: IconDefinition) {
  const key = `${icon.prefix}:${icon.iconName}`
  if (!registered.has(key)) {
    library.add(icon)
    registered.add(key)
  }
}

export function resolveIcon(
  key: SemanticIconKey,
  style: IconStyle = 'outline',
): IconDefinition {
  const pair = registry[key]
  const icon = style === 'solid' ? pair.solid : pair.outline
  ensureRegistered(icon)
  return icon
}

export function registerNavIcons() {
  ;(
    [
      'nav.home',
      'nav.action',
      'nav.gallery',
      'nav.achievements',
      'theme.drink-it',
      'theme.ship-it',
      'header.switch-game',
      'action.next',
      'score.leaderboard',
      'status.time',
      'status.completed',
    ] as SemanticIconKey[]
  ).forEach((key) => {
    ensureRegistered(registry[key].outline)
    ensureRegistered(registry[key].solid)
  })
}

/** Confirms Phase 0 uses licensed Pro packages (no free stand-ins). */
export const fontAwesomeProvider = 'pro' as const
