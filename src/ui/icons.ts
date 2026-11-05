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
  faCalendarDay as falCalendarDay,
  faCamera as falCamera,
  faChevronDown as falChevronDown,
  faChevronRight as falChevronRight,
  faCircleCheck as falCircleCheck,
  faCircleInfo as falCircleInfo,
  faClock as falClock,
  faDownload as falDownload,
  faHouse as falHouse,
  faImage as falImage,
  faImages as falImages,
  faLocationDot as falLocationDot,
  faLock as falLock,
  faLockOpen as falLockOpen,
  faMagnifyingGlass as falMagnifyingGlass,
  faMartiniGlass as falMartiniGlass,
  faMedal as falMedal,
  faPause as falPause,
  faPen as falPen,
  faPeopleGroup as falPeopleGroup,
  faPlay as falPlay,
  faRotate as falRotate,
  faRotateRight as falRotateRight,
  faShip as falShip,
  faSquare as falSquare,
  faSquarePlus as falSquarePlus,
  faStar as falStar,
  faTrash as falTrash,
  faTriangleExclamation as falTriangleExclamation,
  faTrophy as falTrophy,
  faUsers as falUsers,
  faXmark as falXmark,
} from '@fortawesome/pro-light-svg-icons'
import {
  faArrowLeft as fasArrowLeft,
  faArrowRight as fasArrowRight,
  faAward as fasAward,
  faBadgeCheck as fasBadgeCheck,
  faCalendarDay as fasCalendarDay,
  faCamera as fasCamera,
  faChevronDown as fasChevronDown,
  faChevronRight as fasChevronRight,
  faCircleCheck as fasCircleCheck,
  faCircleInfo as fasCircleInfo,
  faClock as fasClock,
  faDownload as fasDownload,
  faHouse as fasHouse,
  faImage as fasImage,
  faImages as fasImages,
  faLocationDot as fasLocationDot,
  faLock as fasLock,
  faLockOpen as fasLockOpen,
  faMagnifyingGlass as fasMagnifyingGlass,
  faMartiniGlass as fasMartiniGlass,
  faMedal as fasMedal,
  faPause as fasPause,
  faPen as fasPen,
  faPeopleGroup as fasPeopleGroup,
  faPlay as fasPlay,
  faRotate as fasRotate,
  faRotateRight as fasRotateRight,
  faShip as fasShip,
  faSquare as fasSquare,
  faSquarePlus as fasSquarePlus,
  faStar as fasStar,
  faTrash as fasTrash,
  faTriangleExclamation as fasTriangleExclamation,
  faTrophy as fasTrophy,
  faUsers as fasUsers,
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
  | 'status.info'
  | 'status.warning'
  | 'theme.drink-it'
  | 'theme.ship-it'
  | 'score.leaderboard'
  | 'score.achievement'
  | 'score.medal'
  | 'score.bar'
  | 'score.friends'
  | 'score.team'
  | 'score.calendar'

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
  'status.info': { outline: falCircleInfo, solid: fasCircleInfo },
  'status.warning': { outline: falTriangleExclamation, solid: fasTriangleExclamation },
  'theme.drink-it': { outline: falMartiniGlass, solid: fasMartiniGlass },
  'theme.ship-it': { outline: falShip, solid: fasShip },
  'score.leaderboard': { outline: falTrophy, solid: fasTrophy },
  'score.achievement': { outline: falAward, solid: fasAward },
  'score.medal': { outline: falMedal, solid: fasMedal },
  'score.bar': { outline: falLocationDot, solid: fasLocationDot },
  'score.friends': { outline: falUsers, solid: fasUsers },
  'score.team': { outline: falPeopleGroup, solid: fasPeopleGroup },
  'score.calendar': { outline: falCalendarDay, solid: fasCalendarDay },
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
