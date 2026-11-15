import { type Material, Quaternion, Vector3 } from 'three'

/** A cylinder between two points (struts, braces). */
export function Rod({
  from,
  to,
  r,
  material,
}: {
  from: Vector3
  to: Vector3
  r: number
  material: Material
}) {
  const mid = from.clone().add(to).multiplyScalar(0.5)
  const len = from.distanceTo(to)
  const q = new Quaternion().setFromUnitVectors(
    new Vector3(0, 1, 0),
    to.clone().sub(from).normalize(),
  )
  return (
    <mesh position={mid} quaternion={q} material={material} castShadow>
      <cylinderGeometry args={[r, r, len, 10]} />
    </mesh>
  )
}
