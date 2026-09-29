/**
 * 三层汉白玉台基 + 中央石阶 + 栏杆
 * ------------------------------------------------------------------
 * 台基为旋转体（Lathe），带须弥座式的上下枭线；
 * 踏跺、御路、望柱、栏板、螭首全部实例化。
 */
import * as THREE from 'three';
import { BUILDING } from '../config';
import { getMaterials, marbleRing } from '../gfx/materials';
import { carvedRampMaps } from '../gfx/textures';
import { TAU } from './roofProfile';

const T = BUILDING.tiers;
const S = BUILDING.stairs;

export interface TerraceResult {
  base: THREE.Group;
  railings: THREE.Group;
  stairs: THREE.Group;
}

/** 须弥座式台基剖面（自下而上） */
function tierProfile(radius: number, height: number): THREE.Vector2[] {
  const p: THREE.Vector2[] = [];
  const r = radius;
  p.push(new THREE.Vector2(0.001, 0));
  p.push(new THREE.Vector2(r * 1.015, 0));
  p.push(new THREE.Vector2(r * 1.015, height * 0.1)); // 地���
  p.push(new THREE.Vector2(r * 0.995, height * 0.16)); // 下枭
  p.push(new THREE.Vector2(r * 0.975, height * 0.24));
  p.push(new THREE.Vector2(r * 0.99, height * 0.72)); // 束腰
  p.push(new THREE.Vector2(r * 1.012, height * 0.82)); // 上枭
  p.push(new THREE.Vector2(r * 1.02, height * 0.92)); // 出台
  p.push(new THREE.Vector2(r * 1.045, height)); // 挑出压顶
  p.push(new THREE.Vector2(r * 1.045, height + 0.06));
  p.push(new THREE.Vector2(r * 1.0, height + 0.08));
  p.push(new THREE.Vector2(0.001, height + 0.08));
  return p;
}

export function buildTerrace(): TerraceResult {
  const mats = getMaterials();
  const base = new THREE.Group();
  base.name = 'terrace';
  const railings = new THREE.Group();
  railings.name = 'railings';
  const stairs = new THREE.Group();
  stairs.name = 'stairs';

  // ---- 台基主体（三层共用一套按尺寸铺设的石纹）----
  const tierMat = marbleRing(TAU * T[0].radius, T[0].height, 2.3);
  let bottom = 0;
  T.forEach((tier, i) => {
    const geo = new THREE.LatheGeometry(tierProfile(tier.radius, tier.height), 128);
    const mesh = new THREE.Mesh(geo, tierMat);
    mesh.position.y = bottom;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `tier-${i}`;
    base.add(mesh);
    bottom = tier.top;
  });

  // ---- 栏杆（每层一圈，跳过台阶开口） ----
  const gapHalfAngle = Math.asin(Math.min(0.95, (S.width * 0.62) / T[0].radius));

  const postGeo = buildPostGeometry();
  const panelGeo = buildPanelGeometry();

  T.forEach((tier) => {
    const rr = tier.radius * 1.045 + 0.22;
    const y = tier.top + 0.08;
    const h = 1.18;

    // 望柱间距 ~1.6m
    const spacing = 1.62;
    const count = Math.max(16, Math.round((TAU * rr) / spacing));
    const visible = count - Math.max(2, Math.round((gapHalfAngle * 2 * count) / TAU));

    const posts = new THREE.InstancedMesh(postGeo, mats.marble, count);
    posts.castShadow = true;
    posts.receiveShadow = true;
    railings.add(posts);

    const panelCount = visible;
    const panels = new THREE.InstancedMesh(panelGeo, mats.marble, panelCount);
    panels.castShadow = true;
    panels.receiveShadow = true;
    railings.add(panels);

    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);

    let placed = 0;
    for (let k = 0; k < count; k++) {
      const th = (k / count) * TAU;
      // 台阶开口位于 +Z（th=0）
      const d = Math.abs(((th + Math.PI) % TAU) - Math.PI);
      pos.set(rr * Math.sin(th), y, rr * Math.cos(th));
      quat.setFromAxisAngle(yAxis, th);
      mat.compose(pos, quat, one);
      posts.setMatrixAt(k, mat);

      if (d > gapHalfAngle && placed < panelCount) {
        const arc = (TAU * rr) / count;
        pos.set(
          (rr + 0.02) * Math.sin(th + arc / 2),
          y + h * 0.42,
          (rr + 0.02) * Math.cos(th + arc / 2),
        );
        mat.compose(pos, quat, one);
        panels.setMatrixAt(placed++, mat);
      }
    }
    // 未使用的面板缩为 0
    for (let k = placed; k < panelCount; k++) {
      mat.compose(new THREE.Vector3(0, -999, 0), quat, new THREE.Vector3(0, 0, 0));
      panels.setMatrixAt(k, mat);
    }
    posts.instanceMatrix.needsUpdate = true;
    panels.instanceMatrix.needsUpdate = true;
  });

  // ---- 中央石阶（三跑踏跺）----
  const stepMat = new THREE.MeshStandardMaterial({
    map: mats.marble.map,
    normalMap: mats.marble.normalMap,
    roughnessMap: mats.marble.roughnessMap,
    color: 0xffffff,
    roughness: 1,
    metalness: 0.02,
    envMapIntensity: 0.85,
  });

  T.forEach((tier, i) => {
    const from = i === 0 ? 0 : T[i - 1].top;
    const rise = tier.top - from;
    const steps = S.steps;
    const stepH = rise / steps;
    const run = rise * S.slope;
    const stepD = run / steps;
    const zTop = tier.radius; // 顶端贴住本层面缘
    const zBottom = zTop + run;

    const stepGeo = new THREE.BoxGeometry(S.width, stepH + 0.02, stepD + 0.015);
    const stepMesh = new THREE.InstancedMesh(stepGeo, stepMat, steps);
    stepMesh.castShadow = true;
    stepMesh.receiveShadow = true;
    stairs.add(stepMesh);

    const mat = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    for (let s = 0; s < steps; s++) {
      // 自外向内抬升
      const z = zBottom - (s + 0.5) * stepD;
      pos.set(0, from + (s + 0.5) * stepH, z);
      mat.compose(pos, quat, one);
      stepMesh.setMatrixAt(s, mat);
    }
    stepMesh.instanceMatrix.needsUpdate = true;

    // 御路（中央雕刻斜坡）
    const ramp = buildRamp(from, tier.top, zTop, run);
    stairs.add(ramp);

    // 垂带（两侧斜梁）
    const slopeLen = Math.hypot(run, rise) + 0.5;
    const stringerGeo = new THREE.BoxGeometry(0.36, 0.66, slopeLen);
    const stringers = new THREE.InstancedMesh(stringerGeo, mats.marble, 2);
    stringers.castShadow = true;
    stringers.receiveShadow = true;
    stairs.add(stringers);
    const angle = Math.atan2(rise, run);
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const x = sIdx === 0 ? -(S.width / 2 + 0.18) : S.width / 2 + 0.18;
      const z = zTop + run / 2;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0));
      mat.compose(new THREE.Vector3(x, from + rise / 2 + 0.1, z), q, one);
      stringers.setMatrixAt(sIdx, mat);
    }
    stringers.instanceMatrix.needsUpdate = true;

    // 螭首（台阶两侧的排水兽头）
    const headGeo = new THREE.ConeGeometry(0.32, 0.66, 8);
    headGeo.rotateX(-Math.PI / 2);
    const heads = new THREE.InstancedMesh(headGeo, mats.marble, 2);
    heads.castShadow = true;
    stairs.add(heads);
    for (let sIdx = 0; sIdx < 2; sIdx++) {
      const x = sIdx === 0 ? -(S.imperialWidth / 2 + 0.34) : S.imperialWidth / 2 + 0.34;
      mat.compose(new THREE.Vector3(x, from + 0.36, zBottom - 0.42), new THREE.Quaternion(), one);
      heads.setMatrixAt(sIdx, mat);
    }
    heads.instanceMatrix.needsUpdate = true;
  });

  return { base, railings, stairs };
}

/** 御路：中央斜面石雕 */
function buildRamp(from: number, to: number, zTop: number, run: number): THREE.Mesh {
  const maps = carvedRampMaps();
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    color: 0xffffff,
    roughness: 1,
    metalness: 0.02,
    envMapIntensity: 0.85,
  });
  const rise = to - from;
  const len = Math.hypot(run, rise);
  const geo = new THREE.BoxGeometry(S.imperialWidth, 0.26, len);
  const mesh = new THREE.Mesh(geo, mat);
  const angle = Math.atan2(rise, run);
  mesh.position.set(0, (from + to) / 2 + 0.05, zTop + run / 2);
  mesh.rotation.x = angle;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 望柱：柱身 + 柱头云纹 */
function buildPostGeometry(): THREE.BufferGeometry {
  const h = 1.28;
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(0.001, 0));
  pts.push(new THREE.Vector2(0.19, 0));
  pts.push(new THREE.Vector2(0.19, 0.08));
  pts.push(new THREE.Vector2(0.155, 0.14));
  pts.push(new THREE.Vector2(0.15, h * 0.72));
  pts.push(new THREE.Vector2(0.175, h * 0.78));
  pts.push(new THREE.Vector2(0.15, h * 0.84));
  pts.push(new THREE.Vector2(0.16, h * 0.9));
  // 柱头（莲瓣 + 宝珠）
  pts.push(new THREE.Vector2(0.13, h * 0.95));
  pts.push(new THREE.Vector2(0.17, h * 1.0));
  pts.push(new THREE.Vector2(0.12, h * 1.06));
  pts.push(new THREE.Vector2(0.06, h * 1.1));
  pts.push(new THREE.Vector2(0.001, h * 1.12));
  const geo = new THREE.LatheGeometry(pts, 14);
  geo.scale(1, 1, 1);
  return geo;
}

/** 栏板 */
function buildPanelGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1.55, 0.62, 0.13);
  geo.translate(0, 0, 0);
  return geo;
}
