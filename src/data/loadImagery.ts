import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import { type ImageryIndex, type MosaicRef, tilePath } from '../astro/imagery.ts'
import { useAsync } from '../hooks/useAsync.ts'
import { asset } from './catalog.ts'

let indexPromise: Promise<ImageryIndex | null> | null = null

/**
 * Moon Trek / LROC imagery manifest (npm run data:imagery). Resolves to null when it is not
 * published: every view then keeps its plain material, so the app works without it.
 */
export function loadImageryIndex(): Promise<ImageryIndex | null> {
  indexPromise ??= fetch(asset('data/imagery/index.json'))
    .then((r) => (r.ok ? (r.json() as Promise<ImageryIndex>) : null))
    .catch(() => null)
  return indexPromise
}

export function useImageryIndex(): ImageryIndex | null {
  return useAsync('imagery-index', loadImageryIndex).data ?? null
}

/** Terrain tile id behind a site's surface (`terrain/<id>.bin`); relocated points share it. */
export const terrainTileId = (file: string | undefined) =>
  file ? /([^/]+)\.bin$/.exec(file)?.[1] : undefined

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Draws every tile of a mosaic into one canvas. Null if no tile could be loaded. */
export async function loadMosaicCanvas(ref: MosaicRef): Promise<HTMLCanvasElement | null> {
  const canvas = document.createElement('canvas')
  canvas.width = ref.cols * ref.tileSize
  canvas.height = ref.rows * ref.tileSize
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const jobs: Promise<boolean>[] = []
  for (let r = 0; r < ref.rows; r++) {
    for (let c = 0; c < ref.cols; c++) {
      jobs.push(
        loadImage(asset(tilePath(ref, r, c))).then((img) => {
          if (!img) return false
          ctx.drawImage(img, c * ref.tileSize, r * ref.tileSize, ref.tileSize, ref.tileSize)
          return true
        }),
      )
    }
  }
  const loaded = await Promise.all(jobs)
  return loaded.some(Boolean) ? canvas : null
}

/** Texture for a mosaic (sRGB, mipmapped), disposed when the mosaic changes. */
export function useMosaicTexture(ref: MosaicRef | undefined): CanvasTexture | null {
  const { data, loading } = useAsync(ref ? ref.path : null, () =>
    ref ? loadMosaicCanvas(ref) : Promise.resolve(null),
  )
  // useAsync keeps the previous value while loading: never drape another site's image.
  const canvas = ref && !loading ? data : null
  const texture = useMemo(() => {
    if (!canvas) return null
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 8
    return t
  }, [canvas])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}
