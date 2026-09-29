/**
 * 鎏金宝顶
 * ------------------------------------------------------------------
 * 宝座（压住屋面顶点）→ 覆钵 → 相轮 → 火焰宝珠，全部由旋转体生成。
 */
import * as THREE from 'three';
import { BUILDING } from '../config';
import { getMaterials } from '../gfx/materials';

const F = BUILDING.finial;

export function buildFinial(): THREE.Group {
  const mats = getMaterials();
  const group = new THREE.Group();
  group.name = 'finial';

  const gold = mats.gold;

  // ---- 宝座：压住屋面内缘开口的圆盘 ----
  const seat = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(F.baseRadius, 0),
        new THREE.Vector2(F.baseRadius * 1.02, 0.12),
        new THREE.Vector2(F.baseRadius * 0.96, 0.22),
        new THREE.Vector2(F.baseRadius * 0.9, 0.3),
        new THREE.Vector2(F.baseRadius * 0.92, 0.42),
        new THREE.Vector2(F.radius * 1.02, 0.56),
        new THREE.Vector2(F.radius * 0.96, 0.7),
        new THREE.Vector2(0.001, 0.7),
      ],
      40,
    ),
    gold,
  );
  seat.castShadow = true;
  seat.receiveShadow = true;
  group.add(seat);

  // ---- 覆钵（半球）----
  const bowlH = F.height * 0.42;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(F.radius * 1.02, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56), gold);
  bowl.position.y = 0.66;
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  group.add(bowl);

  // ---- 相轮（叠盘）----
  const ringTop = 0.66 + bowlH * 0.92;
  const rings = 7;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const r = F.radius * (0.46 - t * 0.3);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.06, F.height * 0.035, 24), gold);
    ring.position.y = ringTop + i * F.height * 0.055;
    ring.castShadow = true;
    ring.receiveShadow = true;
    group.add(ring);
  }

  // ---- 火焰宝珠 + 火焰尖 ----
  const beadY = ringTop + rings * F.height * 0.055;
  const bead = new THREE.Mesh(new THREE.SphereGeometry(F.radius * 0.42, 24, 16), gold);
  bead.position.y = beadY + F.radius * 0.42;
  bead.castShadow = true;
  group.add(bead);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(F.radius * 0.3, F.height * 0.3, 16),
    gold,
  );
  flame.position.y = beadY + F.radius * 0.9 + F.height * 0.14;
  flame.castShadow = true;
  group.add(flame);

  // ---- 垂金铃（八角亭式流苏）----
  const tasselGeo = new THREE.ConeGeometry(0.07, 0.3, 8);
  tasselGeo.translate(0, -0.15, 0);
  const tassels = new THREE.InstancedMesh(tasselGeo, gold, 8);
  tassels.castShadow = true;
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    q.setFromEuler(new THREE.Euler(0.25, th, 0));
    mat.compose(
      new THREE.Vector3(Math.sin(th) * F.baseRadius * 0.92, 0.24, Math.cos(th) * F.baseRadius * 0.92),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    tassels.setMatrixAt(i, mat);
  }
  tassels.instanceMatrix.needsUpdate = true;
  group.add(tassels);

  return group;
}
