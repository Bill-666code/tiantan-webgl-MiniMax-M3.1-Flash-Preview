/**
 * 斗拱（InstancedMesh）
 * ------------------------------------------------------------------
 * 每攒斗拱由：栌斗 → N 层「三跳拱 + 小斗」→ 外挑昂 组成。
 * 同一攒的所有单件按类型合并为 InstancedMesh，整圈仅 5 个 draw call。
 */
import * as THREE from 'three';
import { BUILDING } from '../config';
import { getMaterials } from '../gfx/materials';
import { TAU } from './roofProfile';

const P = BUILDING.dougongParts;

/** 方形斗：下大上小的棱台 */
function douGeometry(size: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(size * 0.7, size * 0.86, height, 4, 1, false);
  geo.rotateY(Math.PI / 4);
  return geo;
}

/** 拱：一根中部平、端部上翘的弯木 */
function armGeometry(length: number, width: number, height: number): THREE.BufferGeometry {
  const seg = 10;
  const curve = height * 0.85;
  const shape = new THREE.Shape();
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const s = i / seg;
    const x = (s - 0.5) * length;
    const y = (Math.pow(2 * s - 1, 2) - 0.5) * curve;
    pts.push(new THREE.Vector2(x, y));
  }
  shape.moveTo(pts[0].x, pts[0].y + height * 0.5);
  for (const p of pts) shape.lineTo(p.x, p.y + height * 0.5);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(pts[i].x, pts[i].y - height * 0.5);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  geo.computeVertexNormals();
  return geo;
}

/** 昂：外端斜挑并微翘的挑檐构件 */
function angGeometry(length: number, width: number, height: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const rise = height * 1.5;
  shape.moveTo(-length * 0.34, -height * 0.5);
  shape.lineTo(length * 0.5, -height * 0.5);
  shape.lineTo(length * 0.62, -height * 0.1);
  shape.lineTo(length * 0.62, rise * 0.62);
  shape.lineTo(length * 0.42, rise);
  shape.lineTo(-length * 0.34, height * 0.5);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -width / 2);
  geo.computeVertexNormals();
  return geo;
}

export interface DougongOptions {
  /** 斗栌中心所在半径（= 柱圈半径） */
  radius: number;
  /** 一圈攒数 */
  count: number;
  /** 层数 */
  tiers: number;
  /** 起拱高度（柱头顶） */
  baseY: number;
}

export interface DougongResult {
  group: THREE.Group;
  /** 斗拱顶端高度 */
  topY: number;
  /** 最外一跳（檐檩）半径 */
  purlinRadius: number;
}

export function buildDougongRing(opts: DougongOptions): DougongResult {
  const mats = getMaterials();
  const { radius: R, count: N, tiers: T, baseY } = opts;
  const group = new THREE.Group();
  group.name = 'dougong';

  const armsPerSet = T * 3;
  const capGeo = douGeometry(P.douSize, P.douHeight);
  const smallGeo = douGeometry(P.smallDouSize, P.smallDouHeight);
  const armGeo = armGeometry(P.armLength, P.armWidth, P.armHeight);
  const angGeo = angGeometry(P.tierOut * 1.5, P.armWidth * 1.15, P.armHeight * 1.1);

  const caps = new THREE.InstancedMesh(capGeo, mats.bracketPaint, N);
  const arms = new THREE.InstancedMesh(armGeo, mats.bracketPaint, N * armsPerSet);
  const smalls = new THREE.InstancedMesh(smallGeo, mats.bracketPaint, N * armsPerSet);
  const angs = new THREE.InstancedMesh(angGeo, mats.bracketPaint, N * T);
  for (const m of [caps, arms, smalls, angs]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  let iArm = 0;
  let iSmall = 0;
  let iAng = 0;

  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU;
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    /** 半径 → 世界坐标 */
    const place = (rho: number, y: number, target: THREE.Vector3) => target.set(rho * sin, y, rho * cos);

    // ---- 栌斗 ----
    place(R, baseY + P.douHeight * 0.5, pos);
    quat.setFromAxisAngle(yAxis, th);
    mat.compose(pos, quat, one);
    caps.setMatrixAt(k, mat);

    for (let t = 0; t < T; t++) {
      const armY = baseY + P.douHeight + t * P.tierRise + P.armHeight * 0.5;
      const rho = R + t * P.tierOut + P.tierOut * 0.5;

      // 外拱（径向）
      place(rho, armY, pos);
      quat.setFromAxisAngle(yAxis, th);
      mat.compose(pos, quat, one);
      arms.setMatrixAt(iArm++, mat);
      place(rho, armY + P.armHeight * 0.5 + P.smallDouHeight * 0.5, pos);
      mat.compose(pos, quat, one);
      smalls.setMatrixAt(iSmall++, mat);

      // 左右拱（切向）
      const tangentOffset = P.armLength * 0.46;
      for (const s of [-1, 1]) {
        const px = (rho * sin + s * tangentOffset * cos);
        const pz = (rho * cos - s * tangentOffset * sin);
        pos.set(px, armY, pz);
        quat.setFromAxisAngle(yAxis, th + (s * Math.PI) / 2);
        mat.compose(pos, quat, one);
        arms.setMatrixAt(iArm++, mat);
        pos.set(px, armY + P.armHeight * 0.5 + P.smallDouHeight * 0.5, pz);
        mat.compose(pos, quat, one);
        smalls.setMatrixAt(iSmall++, mat);
      }

      // 外挑昂
      if (t < T) {
        const angY = baseY + P.douHeight + t * P.tierRise - P.armHeight * 0.1;
        place(R + t * P.tierOut + P.tierOut * 0.35, angY, pos);
        const rise = P.angOut;
        mat.compose(
          new THREE.Vector3(pos.x, pos.y + rise * 0.22, pos.z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, th, -Math.atan2(rise, P.tierOut * 1.5) * 0.55)),
          one,
        );
        angs.setMatrixAt(iAng++, mat);
      }
    }
  }

  for (const m of [caps, arms, smalls, angs]) m.instanceMatrix.needsUpdate = true;

  const topY = baseY + P.douHeight + T * P.tierRise;
  const purlinRadius = R + (T - 1) * P.tierOut + P.tierOut;

  // ---- 檐檩（环状承托檩）+ 垫板 ----
  const purlinY = topY - P.tierRise * 0.35;
  const purlin = new THREE.Mesh(
    new THREE.CylinderGeometry(purlinRadius, purlinRadius, P.armWidth * 1.5, 96, 1, true),
    mats.bracketPaint,
  );
  purlin.position.y = purlinY;
  purlin.castShadow = true;
  purlin.receiveShadow = true;
  group.add(purlin);

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(purlinRadius, purlinRadius, 0.1, 96, 1, false),
    mats.bracketPaint,
  );
  plate.position.y = purlinY + P.armWidth * 0.8;
  plate.castShadow = true;
  plate.receiveShadow = true;
  group.add(plate);

  // ---- 柱头枋（把每攒斗栌横向连成一体）----
  const tie = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.06, R + 0.06, P.douHeight * 0.75, 96, 1, true),
    mats.bracketPaint,
  );
  tie.position.y = baseY + P.douHeight * 0.375;
  tie.castShadow = true;
  tie.receiveShadow = true;
  group.add(tie);

  return { group, topY, purlinRadius };
}
