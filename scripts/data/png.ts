/**
 * Minimal PNG reader for the validation scripts (8-bit grey, grey+alpha, RGB, RGBA and
 * palette images; no interlacing). Returns one grey value per pixel and a validity mask
 * (alpha > 0), which is all the map comparisons need. Uses only node:zlib.
 */
import { inflateSync } from 'node:zlib'

export interface GreyImage {
  width: number
  height: number
  grey: Uint8Array
  valid: Uint8Array
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function paeth(a: number, b: number, c: number) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function decodePng(buf: Buffer): GreyImage {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8
  let width = 0
  let height = 0
  let depth = 0
  let type = 0
  let palette: Buffer | null = null
  let alphaTable: Buffer | null = null
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const kind = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      type = data[9]
      if (data[12] !== 0) throw new Error('interlaced PNG not supported')
    } else if (kind === 'PLTE') palette = data
    else if (kind === 'tRNS') alphaTable = data
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    pos += 12 + len
  }
  const ch = CHANNELS[type]
  if (depth !== 8 || !ch) throw new Error(`PNG type ${type}/${depth} bit not supported`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * ch
  const px = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    const row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? px[row + x - ch] : 0
      const b = y > 0 ? px[row - stride + x] : 0
      const c = x >= ch && y > 0 ? px[row - stride + x - ch] : 0
      const v = raw[src + x]
      px[row + x] =
        (f === 0
          ? v
          : f === 1
            ? v + a
            : f === 2
              ? v + b
              : f === 3
                ? v + ((a + b) >> 1)
                : v + paeth(a, b, c)) & 0xff
    }
  }
  const grey = new Uint8Array(width * height)
  const valid = new Uint8Array(width * height).fill(1)
  for (let i = 0; i < width * height; i++) {
    const p = i * ch
    if (type === 3) {
      const k = px[p]
      grey[i] = palette
        ? Math.round(
            0.299 * palette[k * 3] + 0.587 * palette[k * 3 + 1] + 0.114 * palette[k * 3 + 2],
          )
        : k
      if (alphaTable && k < alphaTable.length && alphaTable[k] === 0) valid[i] = 0
    } else if (type === 0 || type === 4) {
      grey[i] = px[p]
      if (type === 4 && px[p + 1] === 0) valid[i] = 0
    } else {
      grey[i] = Math.round(0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2])
      if (type === 6 && px[p + 3] === 0) valid[i] = 0
    }
  }
  return { width, height, grey, valid }
}
