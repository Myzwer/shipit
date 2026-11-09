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
  faBolt as falBolt,
  faBottleDroplet as falBottleDroplet,
  faBullseye as falBullseye,
  faCalendarDay as falCalendarDay,
  faCamera as falCamera,
  faChevronDown as falChevronDown,
  faChevronRight as falChevronRight,
  faCircleCheck as falCircleCheck,
  faCircleDot as falCircleDot,
  faCircleInfo as falCircleInfo,
  faClock as falClock,
  faCompass as falCompass,
  faDownload as falDownload,
  faFaceSleeping as falFaceSleeping,
  faFire as falFire,
  faGem as falGem,
  faHouse as falHouse,
  faImage as falImage,
  faImages as falImages,
  faLayerGroup as falLayerGroup,
  faLeaf as falLeaf,
  faLemon as falLemon,
  faListCheck as falListCheck,
  faLocationDot as falLocationDot,
  faLock as falLock,
  faLockOpen as falLockOpen,
  faMagnifyingGlass as falMagnifyingGlass,
  faMartiniGlass as falMartiniGlass,
  faMartiniGlassCitrus as falMartiniGlassCitrus,
  faMedal as falMedal,
  faMoon as falMoon,
  faMugHot as falMugHot,
  faMusic as falMusic,
  faPause as falPause,
  faPen as falPen,
  faPeopleGroup as falPeopleGroup,
  faPepperHot as falPepperHot,
  faPlay as falPlay,
  faRepeat as falRepeat,
  faRoute as falRoute,
  faRotate as falRotate,
  faRotateRight as falRotateRight,
  faShip as falShip,
  faSnowflake as falSnowflake,
  faSquare as falSquare,
  faSquarePlus as falSquarePlus,
  faStar as falStar,
  faSun as falSun,
  faTrash as falTrash,
  faTreePalm as falTreePalm,
  faTriangleExclamation as falTriangleExclamation,
  faTrophy as falTrophy,
  faUmbrellaBeach as falUmbrellaBeach,
  faUserSecret as falUserSecret,
  faUsers as falUsers,
  faUtensils as falUtensils,
  faWhiskeyGlass as falWhiskeyGlass,
  faWineGlass as falWineGlass,
  faXmark as falXmark,
} from '@fortawesome/pro-light-svg-icons'
import {
  faArrowLeft as fasArrowLeft,
  faArrowRight as fasArrowRight,
  faAward as fasAward,
  faBadgeCheck as fasBadgeCheck,
  faBeerMug as fasBeerMug,
  faBolt as fasBolt,
  faBottleDroplet as fasBottleDroplet,
  faBullseye as fasBullseye,
  faCalendarDay as fasCalendarDay,
  faCamera as fasCamera,
  faChevronDown as fasChevronDown,
  faChevronRight as fasChevronRight,
  faCircleCheck as fasCircleCheck,
  faCircleDot as fasCircleDot,
  faCircleInfo as fasCircleInfo,
  faClock as fasClock,
  faCompass as fasCompass,
  faDownload as fasDownload,
  faFaceSleeping as fasFaceSleeping,
  faFire as fasFire,
  faGem as fasGem,
  faHouse as fasHouse,
  faImage as fasImage,
  faImages as fasImages,
  faLayerGroup as fasLayerGroup,
  faLeaf as fasLeaf,
  faLemon as fasLemon,
  faListCheck as fasListCheck,
  faLocationDot as fasLocationDot,
  faLock as fasLock,
  faLockOpen as fasLockOpen,
  faMagnifyingGlass as fasMagnifyingGlass,
  faMartiniGlass as fasMartiniGlass,
  faMartiniGlassCitrus as fasMartiniGlassCitrus,
  faMedal as fasMedal,
  faMoon as fasMoon,
  faMugHot as fasMugHot,
  faMusic as fasMusic,
  faPause as fasPause,
  faPen as fasPen,
  faPeopleGroup as fasPeopleGroup,
  faPepperHot as fasPepperHot,
  faPlay as fasPlay,
  faRepeat as fasRepeat,
  faRoute as fasRoute,
  faRotate as fasRotate,
  faRotateRight as fasRotateRight,
  faShip as fasShip,
  faSnowflake as fasSnowflake,
  faSquare as fasSquare,
  faSquarePlus as fasSquarePlus,
  faStar as fasStar,
  faSun as fasSun,
  faTrash as fasTrash,
  faTreePalm as fasTreePalm,
  faTriangleExclamation as fasTriangleExclamation,
  faTrophy as fasTrophy,
  faUmbrellaBeach as fasUmbrellaBeach,
  faUserSecret as fasUserSecret,
  faUsers as fasUsers,
  faUtensils as fasUtensils,
  faWhiskeyGlass as fasWhiskeyGlass,
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
  | 'status.unselected'
  | 'status.locked'
  | 'status.unlocked'
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
