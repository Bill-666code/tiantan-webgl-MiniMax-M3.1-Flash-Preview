/**
 * 屋顶构建
 * ------------------------------------------------------------------
 * · 剖面由 roofProfile 求得（举折 + 檐口起翘），绕轴旋转成面；
 * · 上下两层壳体 + 檐口/内缘封边，保证从任何角度看都是实体；
 * · 瓦垄起伏由法线贴图表现（每片纹理含 4 个瓦垄 × 8 个瓦垡），
 *   重复次数直接写进 UV，因此三重屋顶共用同一材质；
 * · 檐口加 瓦当(圆头) / 滴水 实例化小构件，勾出檐口细部。
 */
import * as THREE from 'three';
import type { LevelSpec } from '../config';
import { getMaterials } from '../gfx/materials';
import { offsetProfile, profileArcLength, sampleRoofProfile, TAU } from './roofProfile';
import type { ProfilePoint } from './roofProfile';

/** 一张瓦贴图覆盖的瓦垄数 */
const TILES_PER_PATCH = 4;
/** 一张瓦贴图覆盖的瓦垡数 */
const COURSES_PER_PATCH = 8;
/** 瓦垡间距（米） */
const COURSE_SPACING = 0.46;

export interface RoofOptions {
  radialSegments: number;
  profileSegments: number;
}

export interface RoofResult {
  object: THREE.Group;
  profile: ProfilePoint[];
  /** 屋面在给定半径处的高度（用于放置鼓座 / 柱脚） */
  surfaceYAt(radius: number): number;
}

export function buildRoof(spec: LevelSpec, opts: RoofOptions): RoofResult {
  const mats = getMaterials();
  const profile = sampleRoofProfile({
    innerRadius: spec.innerRadius,
    innerY: spec.innerY,
    eaveRadius: spec.eaveRadius,
    eaveY: spec.eaveY,
    flatTop: spec.flatTop,
    samples: opts.profileSegments,
    rho: spec.rho,
    eaveLift: spec.eaveLift,
    eaveFlare: spec.eaveFlare,
  });

  const arc = profileArcLength(profile);
  const thicknessInner = 0.14;
  const thicknessEave = 0.32;
  const bottom = offsetProfile(profile, (t) => thicknessInner + (thicknessEave - thicknessInner) * t * t);

  const R = opts.radialSegments;
  const Rb = Math.max(72, Math.round(R / 2));
  const P = profile.length;

  const uRepeat = spec.tileCount / TILES_PER_PATCH;
  const vRepeat = arc / (COURSES_PER_PATCH * COURSE_SPACING);
  const uRepeatBottom = uRepeat * 1.7;
  const vRepeatBottom = arc / 5.5;

  // 剖面累计弧长 → v
  const arcAt: number[] = [0];
  for (let i = 1; i < P; i++) {
    arcAt.push(arcAt[i - 1] + Math.hypot(profile[i].r - profile[i - 1].r, profile[i].y - profile[i - 1].y));
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushSurface = (pts: ProfilePoint[], radial: number, uRep: number, vRep: number, flip: boolean) => {
    const base = positions.length / 3;
    for (let i = 0; i < radial; i++) {
      const th = (i / radial) * TAU;
      const sin = Math.sin(th);
      const cos = Math.cos(th);
      for (let j = 0; j < P; j++) {
        const p = pts[j];
        positions.push(p.r * sin, p.y, p.r * cos);
        uvs.push((i / radial) * uRep, (arcAt[j] / (arc || 1)) * vRep);
      }
    }
    for (let i = 0; i < radial; i++) {
      const i2 = (i + 1) % radial;
      for (let j = 0; j < P - 1; j++) {
        const a = base + i * P + j;
        const b = base + i2 * P + j;
        const c = base + i2 * P + j + 1;
        const d = base + i * P + j + 1;
        if (flip) indices.push(a, b, c, a, c, d);
        else indices.push(a, c, b, a, d, c);
      }
    }
    return base;
  };

  const groupTop = indices.length;
  pushSurface(profile, R, uRepeat, vRepeat, false);
  const groupEndTop = indices.length;

  const groupBottom = indices.length;
  pushSurface(bottom, Rb, uRepeatBottom, vRepeatBottom, true);
  const groupEndBottom = indices.length;

  // ---- 封边（檐口 + 内缘） ----
  const pushRim = (outer: boolean) => {
    const base = positions.length / 3;
    const radial = outer ? R : Math.max(72, Math.round(R / 2));
    const jTop = outer ? P - 1 : 0;
    const jBot = outer ? P - 1 : 0;
    for (let i = 0; i < radial; i++) {
      const th = (i / radial) * TAU;
      const sin = Math.sin(th);
      const cos = Math.cos(th);
      const t = profile[jTop];
      const b = bottom[jBot];
      positions.push(t.r * sin, t.y, t.r * cos);
      uvs.push(i / radial, 0);
      positions.push(b.r * sin, b.y, b.r * cos);
      uvs.push(i / radial, 1);
    }
    for (let i = 0; i < radial; i++) {
      const i2 = (i + 1) % radial;
      const a = base + i * 2;
      const b2 = base + i2 * 2;
      const c = base + i2 * 2 + 1;
      const d = base + i * 2 + 1;
      if (outer) indices.push(a, b2, c, a, c, d);
      else indices.push(a, c, b2, a, d, c);
    }
  };
  const groupRim = indices.length;
  pushRim(true);
  if (!spec.flatTop) pushRim(false);
  const groupEndRim = indices.length;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.addGroup(groupTop, groupEndTop - groupTop, 0);
  geometry.addGroup(groupBottom, groupEndBottom - groupBottom, 1);
  geometry.addGroup(groupRim, groupEndRim - groupRim, 2);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const group = new THREE.Group();
  group.name = `roof-${spec.name}`;
  const mesh = new THREE.Mesh(geometry, [mats.roofTop, mats.roofBottom, mats.roofEdge]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // ---- 檐口瓦当 / 滴水 ----
  group.add(buildEaveTiles(spec, profile[profile.length - 1], profile[profile.length - 2]));

  const surfaceYAt = (radius: number): number => {
    // 剖面自内向外单调递减，找到对应点
    for (let j = 1; j < P; j++) {
      if (profile[j].r >= radius) {
        const t = (radius - profile[j - 1].r) / (profile[j].r - profile[j - 1].r || 1);
        return profile[j - 1].y + (profile[j].y - profile[j - 1].y) * t;
      }
    }
    return profile[P - 1].y;
  };

  return { object: group, profile, surfaceYAt };
}

/** 檐口：每个瓦垄末端一个瓦当，垄间挂一片滴水 */
function buildEaveTiles(spec: LevelSpec, tip: ProfilePoint, prev: ProfilePoint): THREE.Group {
  const mats = getMaterials();
  const group = new THREE.Group();
  group.name = 'eave-tiles';

  const tr = tip.r - prev.r;
  const ty = tip.y - prev.y;
  const tl = Math.hypot(tr, ty) || 1;
  const nr = -ty / tl;
  const ny = tr / tl;

  const tileWidth = (TAU * tip.r) / spec.tileCount;
  const radius = Math.min(tileWidth * 0.34, 0.13);
  const count = spec.tileCount;

  const capGeo = new THREE.CylinderGeometry(radius, radius * 0.92, radius * 0.62, 10, 1, false);
  const capMesh = new THREE.InstancedMesh(capGeo, mats.eaveTile, count);
  capMesh.castShadow = false;
  capMesh.receiveShadow = false;

  const dripGeo = new THREE.CylinderGeometry(0.012, tileWidth * 0.2, tileWidth * 0.42, 3, 1, false);
  const dripMesh = new THREE.InstancedMesh(dripGeo, mats.eaveTile, count);

  const axis = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);

  for (let k = 0; k < count; k++) {
    const th = ((k + 0.5) / count) * TAU;
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    axis.set(nr * sin, ny, nr * cos).normalize();
    quat.setFromUnitVectors(up, axis);

    // 瓦当
    pos.set((tip.r + nr * radius * 0.3) * sin, tip.y + ny * radius * 0.3, (tip.r + nr * radius * 0.3) * cos);
    mat4.compose(pos, quat, scale);
    capMesh.setMatrixAt(k, mat4);

    // 滴水（垄间，向下）
    const th2 = (k / count) * TAU;
    const s2 = Math.sin(th2);
    const c2 = Math.cos(th2);
    axis.set(nr * s2, ny, nr * c2).normalize();
    quat.setFromUnitVectors(up, axis);
    pos.set((tip.r + nr * radius * 1.1 - tileWidth * 0.16) * s2, tip.y + ny * radius * 1.1 - tileWidth * 0.1, (tip.r + nr * radius * 1.1 - tileWidth * 0.16) * c2);
    mat4.compose(pos, quat, scale);
    dripMesh.setMatrixAt(k, mat4);
  }

  capMesh.instanceMatrix.needsUpdate = true;
  dripMesh.instanceMatrix.needsUpdate = true;
  group.add(capMesh, dripMesh);
  return group;
}
