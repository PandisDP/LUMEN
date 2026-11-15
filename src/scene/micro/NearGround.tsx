import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DodecahedronGeometry,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  OctahedronGeometry,
  Quaternion,
  ShaderChunk,
  Sphere,
  Vector2,
  Vector3,
} from 'three'
import type { DemGrid } from '../../astro/dem.ts'
import { groundSampler } from '../../astro/descent.ts'
import type { SiteDetail } from '../../data/catalog.ts'
import { useMissionStore } from '../../store/useMissionStore.ts'
import { prefersReducedMotion } from '../canvasTexture.ts'
import {
  LANDER_CLEARANCE_M,
  ROCK_CELL_M,
  ROCK_SHAPES,
  ROUTE_CLEARANCE_M,
  type RoutePoint,
  hash2,
  nearGroundStats,
  patchSurface,
  ringRadii,
  rocksInCell,
  routeIndex,
  smoothstep,
  terrainMeshSampler,
  terrainSegments,
} from './nearGroundField.ts'
import { REGOLITH_TILE_M, regolithTextures, setRegolithSunElevation } from './regolith.ts'
import { roverTelemetry } from './roverTelemetry.ts'
import { surfaceHalfSize } from './surface.ts'

/**
 * Close-range ground around the rover (or the lander): the DEM has one height every 20 m and the
 * terrain mesh one vertex every 40 m, so from a camera 5 m away the ground is a flat blur. This
 * lays a finely meshed patch over it with decimetre relief, small craters, fine grain and rocks.
 * It is decoration only — the rover still drives on the DEM, and the patch is kept flat along its
 * route and under the lander — and it melts into the terrain at its rim.
 */

interface PatchConfig {
  /** Radius of the patch, m. */
  radiusM: number
  /** Vertices per ring. */
  spokes: number
  /** Ring spacing near the centre, m, kept out to `denseRadiusM`. */
  innerStepM: number
  denseRadiusM: number
  /** Rocks out to this distance from the centre, m. */
  rockRadiusM: number
  /** Re-centre once the rover is this far from the centre of the patch, m. */
  recentreM: number
}

const FULL: PatchConfig = {
  radiusM: 64,
  spokes: 200,
  innerStepM: 0.5,
  denseRadiusM: 16,
  rockRadiusM: 42,
  recentreM: 15,
}
/** Modest displays and reduced-motion users: a smaller, coarser patch. */
const LIGHT: PatchConfig = {
  radiusM: 46,
  spokes: 160,
  innerStepM: 0.6,
  denseRadiusM: 14,
  rockRadiusM: 34,
  recentreM: 11,
}

/** Centres snap to this grid, m, so a re-centred patch samples the relief at repeatable places. */
const SNAP_M = 4
const ROCKS_PER_SHAPE = 128
/** Same base colour as the terrain underneath (MicroScene `Ground`). */
const GROUND_COLOR = '#bab5ad'
/** The fine grain repeats every REGOLITH_TILE_M / FINE m (≈ 6 mm per texel). */
const FINE = 8

// The terrain's three texture scales (regolith.ts), plus a fourth, finer one that only exists on
// the patch and near the camera; `vNearFade` takes it to zero at the rim.
const MAP_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  float regDist = length(vViewPosition);
  vec3 regNear = texture2D(map, vMapUv).rgb;
  vec3 regMid = texture2D(map, vMapUv * 0.111 + vec2(0.37, 0.61)).rgb;
  vec3 regFar = texture2D(map, vMapUv * 0.0137 + vec2(0.71, 0.13)).rgb;
  float regNearW = 1.0 - smoothstep(40.0, 500.0, regDist);
  vec3 regColor = mix(regMid, regNear, regNearW);
  regColor *= 0.45 + 0.68 * regFar;
  float fineW = vNearFade * (1.0 - smoothstep(14.0, 60.0, regDist));
  vec3 regFine = texture2D(map, vMapUv * ${FINE.toFixed(1)} + vec2(0.19, 0.43)).rgb;
  regColor *= mix(vec3(1.0), 0.3 + 1.1 * regFine, fineW);
  diffuseColor.rgb *= regColor;
#endif
`

const NORMAL_FRAGMENT = ShaderChunk.normal_fragment_maps.replace(
  'mapN.xy *= normalScale;',
  /* glsl */ `
  float nearDist = length(vViewPosition);
  float nearW = vNearFade * (1.0 - smoothstep(14.0, 60.0, nearDist));
  vec3 fineN = texture2D(normalMap, vNormalMapUv * ${FINE.toFixed(1)} + vec2(0.19, 0.43)).xyz * 2.0 - 1.0;
  mapN.xy = mapN.xy * (1.0 - smoothstep(10.0, 300.0, nearDist)) + fineN.xy * nearW;
  mapN.xy *= normalScale;`,
)

// From afar (the top-down camera, the orbit around the lander) the patch shades exactly like
// the terrain it lies on: the relief only shows near the camera.
const NORMAL_VERTEX = /* glsl */ `
#include <beginnormal_vertex>
  float nearViewDist = length((modelViewMatrix * vec4(position, 1.0)).xyz);
  float nearReliefW = uNearRelief * (1.0 - smoothstep(60.0, 200.0, nearViewDist));
  objectNormal = normalize(mix(aMeshNormal, objectNormal, nearReliefW));
`

function nearGroundMaterial() {
  const tex = regolithTextures()
  const relief = { value: 1 }
  const m = new MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 0.96,
    metalness: 0,
    map: tex?.map ?? null,
    normalMap: tex?.normalMap ?? null,
    normalScale: new Vector2(0.5, 0.5),
  })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNearRelief = relief
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        'attribute float aFade;\nattribute vec3 aMeshNormal;\nuniform float uNearRelief;\nvarying float vNearFade;\n#include <common>',
      )
      .replace('#include <beginnormal_vertex>', NORMAL_VERTEX)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNearFade = aFade;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', 'varying float vNearFade;\n#include <common>')
      .replace('#include <map_fragment>', MAP_FRAGMENT)
      .replace('#include <normal_fragment_maps>', NORMAL_FRAGMENT)
  }
  m.customProgramCacheKey = () => 'regolith-near-v2'
  m.userData.relief = relief
  return m
}

/**
 * Same idea as setRegolithSunElevation, for the relief of the mesh itself: with the Sun a degree
 * up, every hollow of the undulation would shade as a black stain (nothing here casts the long
 * shadows that would explain it), so the shading leans on the terrain's normal until it climbs.
 */
function setReliefSunElevation(material: MeshStandardMaterial, sunElDeg: number) {
  const k = Math.min(1, Math.max(0, (sunElDeg - 0.5) / 9.5))
  ;(material.userData.relief as { value: number }).value = 0.45 + 0.55 * k
}

/** A low-poly stone: a polyhedron with every corner pushed in or out, flat-shaded. */
function rockGeometry(shape: number) {
  const g =
    shape === 0
      ? new IcosahedronGeometry(0.5, 0)
      : shape === 1
        ? new IcosahedronGeometry(0.5, 1)
        : shape === 2
          ? new DodecahedronGeometry(0.5, 0)
          : new OctahedronGeometry(0.5, 1)
  const p = g.getAttribute('position')
  const amount = shape === 1 ? 0.22 : 0.3
  let reach = 0
  for (let i = 0; i < p.count; i++) {
    // The polyhedra are not indexed: corners shared by several faces must move together.
    const qx = Math.round(p.getX(i) * 1000)
    const qy = Math.round(p.getY(i) * 1000)
    const qz = Math.round(p.getZ(i) * 1000)
    const k = 1 - amount * hash2(qx + qy * 7919, qz + qy * 104729, 300 + shape)
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k)
    reach = Math.max(reach, Math.abs(p.getX(i)), Math.abs(p.getY(i)), Math.abs(p.getZ(i)))
  }
  // Unit size: the largest half-extent is 0.5.
  g.scale(0.5 / reach, 0.5 / reach, 0.5 / reach)
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

function createPatch(
  detail: SiteDetail,
  grids: DemGrid[],
  route: readonly RoutePoint[] | undefined,
  cfg: PatchConfig,
) {
  const ground = groundSampler(detail.site, grids)
  const mesh = grids.length
    ? terrainMeshSampler(
        detail.site,
        grids,
        ground,
        surfaceHalfSize(detail),
        terrainSegments(Boolean(detail.terrain)),
      )
    : null
  const path = routeIndex(route)
  const surface = patchSurface(ground, mesh, path, cfg.radiusM)

  // Polar grid: dense rings where the camera is, wider ones towards the rim.
  const radii = ringRadii(cfg.radiusM, cfg.innerStepM, cfg.denseRadiusM)
  const rings = radii.length
  const n = cfg.spokes
  const count = 1 + rings * n
  const cos = new Float32Array(n)
  const sin = new Float32Array(n)
  for (let j = 0; j < n; j++) {
    cos[j] = Math.cos((j / n) * Math.PI * 2)
    sin[j] = Math.sin((j / n) * Math.PI * 2)
  }
  const positions = new Float32Array(count * 3)
  const normals = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const fades = new Float32Array(count)
  const meshNormals = new Float32Array(count * 3)
  const indices = new Uint32Array((n + (rings - 1) * n * 2) * 3)
  let k = 0
  for (let j = 0; j < n; j++) {
    indices[k++] = 0
    indices[k++] = 1 + ((j + 1) % n)
    indices[k++] = 1 + j
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let j = 0; j < n; j++) {
      const a = 1 + r * n + j
      const b = 1 + r * n + ((j + 1) % n)
      const c = a + n
      const d = b + n
      indices[k++] = a
      indices[k++] = b
      indices[k++] = c
      indices[k++] = b
      indices[k++] = d
      indices[k++] = c
    }
  }
  const geometry = new BufferGeometry()
  const positionAttr = new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage)
  const normalAttr = new BufferAttribute(normals, 3).setUsage(DynamicDrawUsage)
  const uvAttr = new BufferAttribute(uvs, 2).setUsage(DynamicDrawUsage)
  const fadeAttr = new BufferAttribute(fades, 1).setUsage(DynamicDrawUsage)
  const meshNormalAttr = new BufferAttribute(meshNormals, 3).setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', positionAttr)
  geometry.setAttribute('normal', normalAttr)
  geometry.setAttribute('uv', uvAttr)
  geometry.setAttribute('aFade', fadeAttr)
  geometry.setAttribute('aMeshNormal', meshNormalAttr)
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.boundingSphere = new Sphere(new Vector3(), 0)
  geometry.setDrawRange(0, 0)

  const rockGeometries = Array.from({ length: ROCK_SHAPES }, (_, i) => rockGeometry(i))
  // Fresh rock is a touch darker and less dusty than the regolith it sits in.
  const rockMaterials = [0.82, 0.94].map(
    (roughness) =>
      new MeshStandardMaterial({ color: '#8f8b85', roughness, metalness: 0, flatShading: true }),
  )
  const rocks = rockGeometries.map((g, i) => {
    const m = new InstancedMesh(g, rockMaterials[i % 2], ROCKS_PER_SHAPE)
    m.instanceMatrix.setUsage(DynamicDrawUsage)
    m.castShadow = true
    m.receiveShadow = true
    m.count = 0
    m.setColorAt(0, new Color(1, 1, 1))
    return m
  })
  const used = new Int32Array(ROCK_SHAPES)

  const s = new Float64Array(6)
  const tmp = {
    matrix: new Matrix4(),
    pos: new Vector3(),
    scale: new Vector3(),
    quat: new Quaternion(),
    yaw: new Quaternion(),
    axis: new Vector3(),
    color: new Color(),
  }
  const UP = new Vector3(0, 1, 0)
  let cx = NaN
  let cz = NaN

  const put = (i: number, x: number, z: number) => {
    surface.sample(x, z, s)
    positions[i * 3] = x
    positions[i * 3 + 1] = s[0]
    positions[i * 3 + 2] = z
    uvs[i * 2] = x / REGOLITH_TILE_M
    uvs[i * 2 + 1] = z / REGOLITH_TILE_M
    fades[i] = s[1]
    meshNormals[i * 3] = s[2]
    meshNormals[i * 3 + 1] = s[3]
    meshNormals[i * 3 + 2] = s[4]
  }

  const buildGround = () => {
    put(0, cx, cz)
    let top = positions[1]
    let bottom = top
    for (let r = 0; r < rings; r++) {
      const radius = radii[r]
      for (let j = 0; j < n; j++) {
        const i = 1 + r * n + j
        put(i, cx + radius * cos[j], cz + radius * sin[j])
        const y = positions[i * 3 + 1]
        if (y > top) top = y
        else if (y < bottom) bottom = y
      }
    }
    geometry.computeVertexNormals()
    // Towards the rim the shading goes over to the terrain's own smooth normals: with the Sun
    // a degree or two up, a fraction of a degree of difference would draw the rim as a line.
    for (let i = 0; i < count; i++) {
      const o = i * 3
      const len = Math.hypot(meshNormals[o], meshNormals[o + 1], meshNormals[o + 2]) || 1
      meshNormals[o] /= len
      meshNormals[o + 1] /= len
      meshNormals[o + 2] /= len
      const w = fades[i]
      if (w >= 1) continue
      const x = normals[o] * w + meshNormals[o] * (1 - w)
      const y = normals[o + 1] * w + meshNormals[o + 1] * (1 - w)
      const z = normals[o + 2] * w + meshNormals[o + 2] * (1 - w)
      const l = Math.hypot(x, y, z) || 1
      normals[o] = x / l
      normals[o + 1] = y / l
      normals[o + 2] = z / l
    }
    positionAttr.needsUpdate = true
    normalAttr.needsUpdate = true
    uvAttr.needsUpdate = true
    fadeAttr.needsUpdate = true
    meshNormalAttr.needsUpdate = true
    const mid = (top + bottom) / 2
    geometry.boundingSphere!.center.set(cx, mid, cz)
    geometry.boundingSphere!.radius = Math.hypot(cfg.radiusM, top - mid) + 1
    geometry.setDrawRange(0, indices.length)
  }

  const buildRocks = () => {
    used.fill(0)
    const reach = cfg.rockRadiusM
    const ix0 = Math.floor((cx - reach) / ROCK_CELL_M)
    const ix1 = Math.floor((cx + reach) / ROCK_CELL_M)
    const iz0 = Math.floor((cz - reach) / ROCK_CELL_M)
    const iz1 = Math.floor((cz + reach) / ROCK_CELL_M)
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        for (const rock of rocksInCell(ix, iz)) {
          const dist = Math.hypot(rock.x - cx, rock.z - cz)
          if (dist >= reach || used[rock.shape] >= ROCKS_PER_SHAPE) continue
          const half = rock.sizeM / 2
          if (path.distance(rock.x, rock.z) < ROUTE_CLEARANCE_M + half) continue
          if (rock.x ** 2 + rock.z ** 2 < (LANDER_CLEARANCE_M + half) ** 2) continue
          // Stones shrink to nothing towards the edge of their area instead of ending in a line.
          const size = rock.sizeM * (1 - smoothstep(reach * 0.8, reach, dist))
          const height = size * rock.squash
          surface.sample(rock.x, rock.z, s)
          tmp.pos.set(rock.x, s[0] + height * (0.5 - rock.sink), rock.z)
          tmp.scale.set(size, height, size * (0.65 + 0.35 * rock.tone))
          tmp.axis.set(Math.cos(rock.tiltAz), 0, Math.sin(rock.tiltAz))
          tmp.quat.setFromAxisAngle(tmp.axis, rock.tilt)
          tmp.yaw.setFromAxisAngle(UP, rock.yaw)
          tmp.quat.multiply(tmp.yaw)
          tmp.matrix.compose(tmp.pos, tmp.quat, tmp.scale)
          const m = rocks[rock.shape]
          const i = used[rock.shape]++
          m.setMatrixAt(i, tmp.matrix)
          m.setColorAt(i, tmp.color.setScalar(rock.tone))
        }
      }
    }
    let total = 0
    rocks.forEach((m, i) => {
      m.count = used[i]
      total += used[i]
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    })
    return total
  }

  return {
    geometry,
    rocks,
    /** Re-centres the patch when (x, z) has strayed far enough from its centre. */
    update(x: number, z: number) {
      if (Math.hypot(x - cx, z - cz) <= cfg.recentreM) return
      const t0 = performance.now()
      cx = Math.round(x / SNAP_M) * SNAP_M
      cz = Math.round(z / SNAP_M) * SNAP_M
      surface.prepare(cx, cz)
      buildGround()
      const total = buildRocks()
      const ms = performance.now() - t0
      nearGroundStats.builds++
      nearGroundStats.lastMs = ms
      // The first build includes JIT warm-up; the ones that matter are the re-centres.
      if (nearGroundStats.builds > 1) nearGroundStats.maxMs = Math.max(nearGroundStats.maxMs, ms)
      nearGroundStats.vertices = count
      nearGroundStats.rocks = total
      if (import.meta.env.DEV) Object.assign(globalThis, { __nearGround: nearGroundStats })
    },
    dispose() {
      geometry.dispose()
      rockGeometries.forEach((g) => g.dispose())
      rockMaterials.forEach((m) => m.dispose())
      rocks.forEach((m) => m.dispose())
    },
  }
}

export function NearGround({
  detail,
  grids,
  follow,
  route,
  sunElDeg,
}: {
  detail: SiteDetail
  grids: DemGrid[]
  follow: 'rover' | 'lander'
  route?: readonly (readonly [number, number, number])[]
  sunElDeg: number
}) {
  // The terrain's data layers (slope, illumination, orbital photo) are drawn on the terrain mesh:
  // the decorative ground steps aside for them.
  const layers = useMissionStore((s) => s.showSlope || s.showIllum || s.showNac)
  const cfg = useMemo(
    () => (prefersReducedMotion() || (globalThis.devicePixelRatio ?? 1) < 1.5 ? LIGHT : FULL),
    [],
  )
  const patch = useMemo(() => createPatch(detail, grids, route, cfg), [detail, grids, route, cfg])
  useEffect(() => () => patch.dispose(), [patch])
  const material = useMemo(() => nearGroundMaterial(), [])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    setRegolithSunElevation(material, sunElDeg)
    setReliefSunElevation(material, sunElDeg)
  }, [material, sunElDeg])
  useFrame(() => {
    const tm = roverTelemetry
    const roving = follow === 'rover' && tm.active
    patch.update(roving ? tm.x : 0, roving ? tm.z : 0)
  })
  return (
    <group visible={!layers}>
      <mesh geometry={patch.geometry} material={material} receiveShadow />
      {patch.rocks.map((m) => (
        <primitive key={m.uuid} object={m} />
      ))}
    </group>
  )
}
