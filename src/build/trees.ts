/**
 * 广场绿化：松、槐、灌木（全部 InstancedMesh）
 * 树形均为低面数程序化几何，保留 flatShading 以获得插画质感。
 */
import * as THREE from 'three';
import { getMaterials } from '../gfx/materials';
import { mulberry32 } from '../gfx/noise';

/** 松树：主干 + 三层锥形树冠 */
function pineGeometry(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.13, 0.2, 2.6, 7);
  trunk.translate(0, 1.3, 0);

  const parts: THREE.BufferGeometry[] = [];
  const layers = [
    { y: 1.7, r: 2.05, h: 1.75 },
    { y: 3.0, r: 1.62, h: 1.55 },
    { y: 4.15, r: 1.1, h: 1.35 },
  ];
  for (const l of layers) {
    const cone = new THREE.ConeGeometry(l.r, l.h, 9, 1);
    cone.translate(0, l.y + l.h * 0.5 - 0.55, 0);
    parts.push(cone);
  }
  return { trunk, crown: mergeGeometries(parts) };
}

/** 槐树：主干 + 噪声扰动的球形树冠 */
function roundTreeGeometry(): { trunk: THREE.BufferGeometry; crown: THREE.BufferGeometry } {
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.4, 7);
  trunk.translate(0, 1.2, 0);

  const geo = new THREE.IcosahedronGeometry(1.75, 1);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const rnd = mulberry32(7);
  const jitter: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 0.82 + rnd() * 0.36;
    jitter.push(x * n, y * n * 0.82, z * n);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(jitter, 3));
  geo.computeVertexNormals();
  geo.translate(0, 3.35, 0);
  return { trunk, crown: geo };
}

/** 极简几何合并（只处理 position/normal/uv，避免引入 BufferGeometryUtils） */
function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const position = new Float32Array(vCount * 3);
  const normal = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const index = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const gp = g.attributes.position as THREE.BufferAttribute;
    const gn = g.attributes.normal as THREE.BufferAttribute;
    const gu = g.attributes.uv as THREE.BufferAttribute | undefined;
    position.set(gp.array as Float32Array, vo * 3);
    normal.set(gn.array as Float32Array, vo * 3);
    if (gu) uv.set(gu.array as Float32Array, vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[io + i] = g.index.getX(i) + vo;
      io += g.index.count;
    } else {
      for (let i = 0; i < gp.count; i++) index[io + i] = i + vo;
      io += gp.count;
    }
    vo += gp.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}

export interface GreensResult {
  group: THREE.Group;
}

/**
 * @param count 树木总数
 * @param innerRadius 内圈种植起始半径
 */
export function buildGreens(count: number, innerRadius = 46, outerRadius = 150): GreensResult {
  const mats = getMaterials();
  const group = new THREE.Group();
  group.name = 'greens';
  const rnd = mulberry32(20240701);

  const pine = pineGeometry();
  const round = roundTreeGeometry();

  const pineCount = Math.floor(count * 0.55);
  const roundCount = count - pineCount;
  const shrubCount = Math.floor(count * 0.3);

  const makeInstanced = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    n: number,
  ) => new THREE.InstancedMesh(geo, material, Math.max(1, n));
  void makeInstanced;

  const e = new THREE.Euler();

  interface Placement {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    scale: THREE.Vector3;
    tint: number;
  }

  /** 先算好每棵树的位姿，躯干与树冠共用，避免错位 */
  const plan = (n: number, rMin: number, rMax: number): Placement[] => {
    const out: Placement[] = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const ang = t * Math.PI * 2 * 7.3 + rnd() * 0.9;
      const r = rMin + (rMax - rMin) * Math.sqrt(rnd());
      const s = 0.75 + rnd() * 0.75;
      out.push({
        pos: new THREE.Vector3(Math.sin(ang) * r, 0, Math.cos(ang) * r),
        quat: new THREE.Quaternion().setFromEuler(e.set(0, rnd() * Math.PI * 2, 0)),
        scale: new THREE.Vector3(s, s * (0.85 + rnd() * 0.4), s),
        tint: 0.78 + rnd() * 0.4,
      });
    }
    return out;
  };

  const emit = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    list: Placement[],
    colorFn: (p: Placement, c: THREE.Color) => void,
  ) => {
    const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const mat = new THREE.Matrix4();
    const color = new THREE.Color();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      mat.compose(p.pos, p.quat, p.scale);
      mesh.setMatrixAt(i, mat);
      colorFn(p, color);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  };

  const pines = plan(pineCount, innerRadius, outerRadius);
  const rounds = plan(roundCount, innerRadius * 1.05, outerRadius);

  emit(pine.trunk, mats.bark, pines, (_p, c) => c.setRGB(1, 1, 1));
  emit(pine.crown, mats.foliagePine, pines, (p, c) => c.setRGB(p.tint * 0.78, p.tint, p.tint * 0.82));
  emit(round.trunk, mats.bark, rounds, (_p, c) => c.setRGB(1, 1, 1));
  emit(round.crown, mats.foliage, rounds, (p, c) => c.setRGB(p.tint * 0.92, p.tint, p.tint * 0.78));

  // 灌木丛
  if (shrubCount > 0) {
    const shrubGeo = new THREE.IcosahedronGeometry(0.95, 1);
    const shrubPos = shrubGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < shrubPos.count; i++) {
      shrubPos.setXYZ(
        i,
        shrubPos.getX(i) * (0.85 + rnd() * 0.35),
        shrubPos.getY(i) * (0.8 + rnd() * 0.4),
        shrubPos.getZ(i) * (0.85 + rnd() * 0.35),
      );
    }
    shrubGeo.computeVertexNormals();
    shrubGeo.translate(0, 0.72, 0);
    const shrubs: Placement[] = [];
    for (let i = 0; i < shrubCount; i++) {
      const t = (i + 0.5) / shrubCount;
      const ang = t * Math.PI * 2 * 5.7 + rnd() * 0.6;
      const r = 28 + (innerRadius - 24) * Math.sqrt(rnd());
      const s = 0.75 + rnd() * 0.85;
      shrubs.push({
        pos: new THREE.Vector3(Math.sin(ang) * r, 0, Math.cos(ang) * r),
        quat: new THREE.Quaternion().setFromEuler(e.set(0, rnd() * Math.PI * 2, 0)),
        scale: new THREE.Vector3(s, s * 0.92, s),
        tint: 0.75 + rnd() * 0.4,
      });
    }
    emit(shrubGeo, mats.foliage, shrubs, (p, c) => c.setRGB(p.tint * 0.85, p.tint, p.tint * 0.8));
  }

  return { group };
}
