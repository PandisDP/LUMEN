import { BufferAttribute, BufferGeometry, NormalBlending, ShaderMaterial } from 'three'
import { mulberry32 } from '../canvasTexture.ts'

/**
 * Regolith grains in vacuum, shared by the lander's engine plume and the rover's wheels: a fixed
 * pool of points stepped on the CPU along ballistic paths (no air: no drag, no billowing).
 */

export const LUNAR_G = 1.62

const VERT = /* glsl */ `
  attribute float alpha;
  attribute float size;
  uniform float scale;
  varying float vAlpha;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    vAlpha = alpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * scale / -mv.z, 0.0, 48.0);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }
`

const FRAG = /* glsl */ `
  varying float vAlpha;
  uniform float opacity;
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.2, d) * vAlpha * opacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.74, 0.71, 0.66), a);
  }
`

/** Point material of the grains. `viewportHeight` (px) turns grain sizes in metres into pixels. */
export function dustMaterial(viewportHeight: number) {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { scale: { value: viewportHeight }, opacity: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: NormalBlending,
  })
}

/** Overall opacity of the grains (1 by default): how much light reaches them. */
export function setDustOpacity(material: ShaderMaterial, opacity: number) {
  material.uniforms.opacity.value = opacity
}

export interface DustOptions {
  /** Size of the pool. */
  max?: number
  seed?: number
  /** Opacity of a grain at its brightest. */
  peakAlpha?: number
  /**
   * Grains stop where they land and fade there over `settleS` (wheel dust). By default they keep
   * sliding along their floor and fade over their whole life (the engine plume).
   */
  settle?: boolean
  settleS?: number
}

/** Fixed pool of dust grains, stepped on the CPU and uploaded as point attributes. */
export class DustSim {
  readonly geometry = new BufferGeometry()
  readonly max: number
  /** Deterministic random source for the emitters. */
  readonly rand: () => number
  /** Fractional grains carried over between frames by the emitter. */
  private carry = 0
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly floor: Float32Array
  private readonly alpha: Float32Array
  private readonly size: Float32Array
  private readonly peakAlpha: number
  private readonly settle: boolean
  private readonly settleS: number
  private next = 0

  constructor({
    max = 1400,
    seed = 11,
    peakAlpha = 0.55,
    settle = false,
    settleS = 0.4,
  }: DustOptions = {}) {
    this.max = max
    this.rand = mulberry32(seed)
    this.peakAlpha = peakAlpha
    this.settle = settle
    this.settleS = settleS
    this.pos = new Float32Array(max * 3)
    this.vel = new Float32Array(max * 3)
    this.age = new Float32Array(max).fill(Infinity)
    this.life = new Float32Array(max)
    this.floor = new Float32Array(max)
    this.alpha = new Float32Array(max)
    this.size = new Float32Array(max)
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3))
    this.geometry.setAttribute('alpha', new BufferAttribute(this.alpha, 1))
    this.geometry.setAttribute('size', new BufferAttribute(this.size, 1))
  }

  clear() {
    this.age.fill(Infinity)
    this.alpha.fill(0)
    this.carry = 0
    this.geometry.attributes.alpha.needsUpdate = true
  }

  /** Whole grains an emitter of `rate` grains per second owes after `dt` seconds. */
  due(rate: number, dt: number): number {
    this.carry += rate * dt
    const n = Math.floor(this.carry)
    this.carry -= n
    return n
  }

  /** Launches one grain (the oldest slot of the pool is reused). `floorY`: where it lands. */
  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    floorY: number,
    lifeS: number,
    sizeM: number,
  ) {
    const i = this.next
    this.next = (this.next + 1) % this.max
    this.pos[i * 3] = x
    this.pos[i * 3 + 1] = y
    this.pos[i * 3 + 2] = z
    this.vel[i * 3] = vx
    this.vel[i * 3 + 1] = vy
    this.vel[i * 3 + 2] = vz
    this.floor[i] = floorY
    this.age[i] = 0
    this.life[i] = lifeS
    this.size[i] = sizeM
  }

  /** Flat ballistic paths under lunar gravity (no air: no drag, no billowing). */
  step(dt: number) {
    const { pos, vel, age, life, floor, alpha, settle, settleS, peakAlpha } = this
    for (let i = 0; i < this.max; i++) {
      if (!(age[i] < life[i])) {
        alpha[i] = 0
        continue
      }
      age[i] += dt
      vel[i * 3 + 1] -= LUNAR_G * dt
      pos[i * 3] += vel[i * 3] * dt
      const y = pos[i * 3 + 1] + vel[i * 3 + 1] * dt
      pos[i * 3 + 1] = Math.max(floor[i], y)
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt
      if (settle) {
        if (y <= floor[i] && vel[i * 3 + 1] < 0) {
          // Landed: it stays there and fades.
          vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0
          life[i] = Math.min(life[i], age[i] + settleS)
        }
        const left = life[i] - age[i]
        alpha[i] = left > 0 ? peakAlpha * Math.min(1, age[i] * 8) * Math.min(1, left / settleS) : 0
        continue
      }
      const f = age[i] / life[i]
      alpha[i] = f < 1 ? peakAlpha * (1 - f) * Math.min(1, age[i] * 8) : 0
    }
    const { attributes } = this.geometry
    attributes.position.needsUpdate = true
    attributes.alpha.needsUpdate = true
    attributes.size.needsUpdate = true
  }
}
