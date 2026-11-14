import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
export const ROOT = root
export const REPORT_DIR = join(root, 'docs/qa/campaign/qa2b-browser-stress')
export const EVIDENCE_DIR = join(REPORT_DIR, 'evidence')
