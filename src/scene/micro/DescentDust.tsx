import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, NormalBlending, ShaderMaterial } from 'three'
import { groundSampler } from '../../astro/descent.ts'
import type { DemGrid } from '../../astro/dem.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useDescentStore } from '../../store/useDescentStore.ts'
import { mulberry32 } from '../canvasTexture.ts'

const MAX = 1400
/** The plume starts to lift dust below this height above the ground, m. */
const DUST_ALT_M = 32
/** Grains per second at touchdown. */
const MAX_RATE = 900
const LUNAR_G = 1.62

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
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = smoothstep(1.0, 0.2, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vec3(0.74, 0.71, 0.66), a);
  }
`

/** Fixed pool of dust grains, stepped on the CPU and uploaded as point attributes. */
class DustSim {
  readonly geometry = new BufferGeometry()
  private readonly pos = new Float32Array(MAX * 3)
  private readonly vel = new Float32Array(MAX * 3)
  private readonly age = new Float32Array(MAX).fill(Infinity)
  private readonly life = new Float32Array(MAX)
  private readonly floor = new Float32Array(MAX)
  private readonly alpha = new Float32Array(MAX)
  private readonly size = new Float32Array(MAX)
  private next = 0
  private carry = 0
  private readonly rand = mulberry32(11)

  constructor() {
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

  /** Lifts grains around (x, z) with a rate that grows as the craft gets close to the ground. */
  emit(x: number, z: number, groundY: number, altM: number, dt: number) {
    if (altM >= DUST_ALT_M) return
    const k = 1 - Math.max(0, altM) / DUST_ALT_M
    this.carry += MAX_RATE * k * k * dt
    while (this.carry >= 1) {
      this.carry -= 1
      const i = this.next
      this.next = (this.next + 1) % MAX
      const a = this.rand() * Math.PI * 2
      const r0 = this.rand() * (1 + altM * 0.15)
      const speed = (12 + this.rand() * 28) * (0.4 + 0.6 * k)
      this.pos[i * 3] = x + Math.cos(a) * r0
      this.pos[i * 3 + 1] = groundY + 0.2
      this.pos[i * 3 + 2] = z + Math.sin(a) * r0
      this.vel[i * 3] = Math.cos(a) * speed
      this.vel[i * 3 + 1] = 0.5 + this.rand() * 3.5 * k
      this.vel[i * 3 + 2] = Math.sin(a) * speed
      this.floor[i] = groundY - 0.5
      this.age[i] = 0
      this.life[i] = 1.4 + this.rand() * 1.8
      this.size[i] = 0.25 + this.rand() * 0.6
    }
  }

  /** Flat ballistic paths under lunar gravity (no air: no drag, no billowing). */
  step(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (!(this.age[i] < this.life[i])) {
        this.alpha[i] = 0
        continue
      }
      this.age[i] += dt
      this.vel[i * 3 + 1] -= LUNAR_G * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] = Math.max(this.floor[i], this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt)
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      const f = this.age[i] / this.life[i]
      this.alpha[i] = f < 1 ? 0.55 * (1 - f) * Math.min(1, this.age[i] * 8) : 0
    }
    const { attributes } = this.geometry
    attributes.position.needsUpdate = true
    attributes.alpha.needsUpdate = true
    attributes.size.needsUpdate = true
  }
}

/**
 * Dust blown off by the engine plume in the last tens of metres. In vacuum there is no cloud:
 * grains leave on fast, flat ballistic paths and fall back under lunar gravity, which is what the
 * Apollo footage shows. Purely cosmetic; it does not touch any metric.
 */
export function DescentDust({ detail, grids }: { detail: SiteDetail; grids: DemGrid[] }) {
  const ground = useMemo(() => groundSampler(detail.site, grids), [detail, grids])
  const height = useThree((s) => s.size.height)
  const run = useDescentStore((s) => s.run)
  const sim = useMemo(() => new DustSim(), [])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { scale: { value: height } },
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      }),
    [height],
  )
  useEffect(() => () => sim.geometry.dispose(), [sim])
  useEffect(() => () => material.dispose(), [material])
  // A restarted descent starts with clean ground.
  useEffect(() => sim.clear(), [sim, run])

  useFrame((frame, delta) => {
    const store = useDescentStore.getState()
    // Grains keep flying for a moment after touchdown; a paused descent freezes them.
    const dt = store.playing || store.landed ? Math.min(delta, 0.1) * store.speed : 0
    if (dt === 0) return
    if (!store.landed) {
      // Emit below the camera, which is the lander's eye while it flies.
      const cam = frame.camera.position
      const gy = ground.groundY(cam.x, cam.z)
      sim.emit(cam.x, cam.z, gy, cam.y - gy, dt)
    }
    sim.step(dt)
  })

  return (
    <points geometry={sim.geometry} material={material} frustumCulled={false} renderOrder={5} />
  )
}
