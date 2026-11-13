/**
 * Local-only private demo photo helpers (Phase 10F).
 * Discovers files under private/photos/ (gitignored). Never commits media.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

const SUPPORTED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'])
const CONVERTIBLE_EXT = new Set(['.heic', '.heif'])
const MAX_BYTES = 5_242_880

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walkFiles(full, out)
    else if (st.isFile()) out.push(full)
  }
  return out
}

function mimeForExt(ext) {
  const e = ext.toLowerCase()
  if (e === '.png') return 'image/png'
  if (e === '.webp') return 'image/webp'
  return 'image/jpeg'
}

function readDimsViaSips(filePath) {
  try {
    const raw = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath], {
      encoding: 'utf8',
    })
    const w = Number((raw.match(/pixelWidth:\s*(\d+)/) || [])[1])
    const h = Number((raw.match(/pixelHeight:\s*(\d+)/) || [])[1])
    if (w > 0 && h > 0) return { width: w, height: h }
  } catch {
    /* fall through */
  }
  return null
}

/** Minimal JPEG SOF parser fallback when sips is unavailable. */
function readJpegDims(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i += 1
      continue
    }
    const marker = buf[i + 1]
    if (marker === 0xd9 || marker === 0xda) break
    const len = (buf[i + 2] << 8) | buf[i + 3]
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = (buf[i + 5] << 8) | buf[i + 6]
      const width = (buf[i + 7] << 8) | buf[i + 8]
      if (width > 0 && height > 0) return { width, height }
    }
    i += 2 + len
  }
  return null
}

function convertToJpeg(srcPath, cacheDir) {
  mkdirSync(cacheDir, { recursive: true })
  const out = join(cacheDir, `${basename(srcPath, extname(srcPath))}.jpg`)
  if (existsSync(out)) return out
  try {
    execFileSync('sips', ['-s', 'format', 'jpeg', srcPath, '--out', out], { stdio: 'pipe' })
    return out
  } catch (e) {
    throw new Error(`HEIC conversion failed for ${srcPath}: ${e.message}`)
  }
}

/**
 * @param {string} root project root
 * @returns {{ photos: Array<{ key: string, absPath: string, relPath: string, mime: string, bytes: Buffer, width: number, height: number, filename: string }>, errors: string[], source: string }}
 */
export function loadPrivateDemoPhotos(root) {
  const photosRoot = join(root, 'private/photos')
  const cacheDir = join(root, '.local/demo-photo-cache')
  const errors = []
  const photos = []

  if (!existsSync(photosRoot)) {
    return { photos, errors: ['private/photos/ missing'], source: 'none' }
  }

  let orderedPaths = []
  const manifestPath = join(photosRoot, 'manifest.json')
  let source = 'recursive_scan'
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const media = Array.isArray(manifest.media) ? manifest.media : []
      for (const row of media) {
        if (!row?.path) continue
        const abs = join(photosRoot, row.path)
        if (existsSync(abs)) orderedPaths.push(abs)
        else errors.push(`manifest path missing: ${row.path}`)
      }
      if (orderedPaths.length) source = 'manifest'
    } catch (e) {
      errors.push(`manifest.json parse failed: ${e.message}`)
    }
  }

  if (!orderedPaths.length) {
    orderedPaths = walkFiles(photosRoot)
      .filter((p) => SUPPORTED_EXT.has(extname(p).toLowerCase()))
      .filter((p) => basename(p) !== 'manifest.json')
      .sort((a, b) => a.localeCompare(b))
  }

  for (const abs of orderedPaths) {
    const ext = extname(abs).toLowerCase()
    if (!SUPPORTED_EXT.has(ext)) continue
    // Decorative placeholder — never use for featured Gallery / Wrapped photos.
    if (basename(abs).toLowerCase() === 'no_image.jpg') {
      errors.push(`skip ${relative(photosRoot, abs)}: decorative placeholder`)
      continue
    }
    try {
      let usePath = abs
      let mime = mimeForExt(ext)
      if (CONVERTIBLE_EXT.has(ext)) {
        usePath = convertToJpeg(abs, cacheDir)
        mime = 'image/jpeg'
      }
      const st = statSync(usePath)
      if (st.size < 1 || st.size > MAX_BYTES) {
        errors.push(`skip ${relative(photosRoot, abs)}: size ${st.size} (limit ${MAX_BYTES})`)
        continue
      }
      const bytes = readFileSync(usePath)
      const dims = readDimsViaSips(usePath) || (mime === 'image/jpeg' ? readJpegDims(bytes) : null)
      if (!dims) {
        errors.push(`skip ${relative(photosRoot, abs)}: could not read dimensions`)
        continue
      }
      photos.push({
        key: relative(photosRoot, abs).replace(/\\/g, '/'),
        absPath: usePath,
        relPath: relative(photosRoot, abs).replace(/\\/g, '/'),
        mime,
        bytes,
        width: dims.width,
        height: dims.height,
        filename: basename(usePath),
      })
    } catch (e) {
      errors.push(`skip ${relative(photosRoot, abs)}: ${e.message}`)
    }
  }

  return { photos, errors, source }
}

/** Deterministic picker that avoids repeating the immediately previous photo. */
export function createPhotoPicker(photos, seedLabel = 'demo') {
  if (!photos.length) {
    return {
      available: false,
      next() {
        return null
      },
      count: 0,
    }
  }
  let lastIndex = -1
  let cursor = 0
  // Stable rotation offset from seed label
  let hash = 0
  for (const ch of seedLabel) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  cursor = hash % photos.length

  return {
    available: true,
    count: photos.length,
    next(slotKey = '') {
      let idx = (cursor + (slotKey.length || 1)) % photos.length
      if (photos.length > 1 && idx === lastIndex) idx = (idx + 1) % photos.length
      lastIndex = idx
      cursor = (idx + 1) % photos.length
      return photos[idx]
    },
  }
}
