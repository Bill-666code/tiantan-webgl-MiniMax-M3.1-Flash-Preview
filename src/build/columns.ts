/**
 * 柱圈 / 鼓座
 * ------------------------------------------------------------------
 * 柱身带收分（卷杀），下有汉白玉柱础，上有描金箍头；
 * 整圈用 InstancedMesh + LatheGeometry，一次绘制。
 */
import * as THREE from 'three';
import { caissonRing, getMaterials } from '../gfx/materials';
import { TAU } from './roofProfile';

export interface ColumnRingOptions {
  count: number;
  radius: number;
  bottom: number;
  top: number;
  columnRadius: number;
  /** 是否绘制柱础 */
  base?: boolean;
  /** 是否绘制箍头（金环） */
  bands?: boolean;
}

/** 带收分的柱身剖面 */
function columnGeometry(height: number, radius: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const bottom = 0;
  pts.push(new THREE.Vector2(0.001, bottom));
  pts.push(new THREE.Vector2(radius * 1.02, bottom));
  pts.push(new THREE.Vector2(radius * 1.03, bottom + height * 0.012));

  const steps = 8;
  const usable = height - height * 0.055;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 收分：底部略粗，向上缓慢收细
    const r = radius * (1.0 - 0.055 * Math.pow(t, 1.6));
    pts.push(new THREE.Vector2(r, bottom + height * 0.02 + usable * t));
  }

  pts.push(new THREE.Vector2(radius * 0.985, bottom + height * 0.975));
  pts.push(new THREE.Vector2(radius * 1.05, bottom + height * 0.985));
  pts.push(new THREE.Vector2(radius * 1.05, bottom + height));
  pts.push(new THREE.Vector2(0.001, bottom + height));

  const geo = new THREE.LatheGeometry(pts, 20);
  geo.computeVertexNormals();
  return geo;
}

export interface ColumnRingResult {
  group: THREE.Group;
  /** 柱头（斗栌底面）高度 */
  topY: number;
}

export function buildColumnRing(opts: ColumnRingOptions): ColumnRingResult {
  const mats = getMaterials();
  const { count, radius, bottom, top, columnRadius } = opts;
  const height = top - bottom;
  const group = new THREE.Group();
  group.name = 'columns';

  const shaftGeo = columnGeometry(height, columnRadius);
  const shafts = new THREE.InstancedMesh(shaftGeo, mats.timberRed, count);
  shafts.castShadow = true;
  shafts.receiveShadow = true;
  group.add(shafts);

  let baseMesh: THREE.InstancedMesh | null = null;
  let bandMesh: THREE.InstancedMesh | null = null;
  if (opts.base !== false) {
    const baseGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, 0),
        new THREE.Vector2(columnRadius * 1.55, 0),
        new THREE.Vector2(columnRadius * 1.55, height * 0.012),
        new THREE.Vector2(columnRadius * 1.22, height * 0.022),
        new THREE.Vector2(columnRadius * 1.04, height * 0.032),
        new THREE.Vector2(0.001, height * 0.032),
      ],
      18,
    );
    baseMesh = new THREE.InstancedMesh(baseGeo, mats.marble, count);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);
  }

  if (opts.bands !== false) {
    const bandGeo = new THREE.CylinderGeometry(columnRadius * 1.07, columnRadius * 1.07, height * 0.028, 20, 1, true);
    bandMesh = new THREE.InstancedMesh(bandGeo, mats.goldDim, count * 2);
    bandMesh.castShadow = false;
    bandMesh.receiveShadow = true;
    group.add(bandMesh);
  }

  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const yAxis = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < count; i++) {
    const th = (i / count) * TAU;
    const sin = Math.sin(th);
    const cos = Math.cos(th);
    quat.setFromAxisAngle(yAxis, th);

    pos.set(radius * sin, bottom, radius * cos);
    mat.compose(pos, quat, one);
    shafts.setMatrixAt(i, mat);
    if (baseMesh) {
      mat.compose(pos, quat, one);
      baseMesh.setMatrixAt(i, mat);
    }
    if (bandMesh) {
      mat.compose(new THREE.Vector3(pos.x, bottom + height * 0.045, pos.z), quat, one);
      bandMesh.setMatrixAt(i * 2, mat);
      mat.compose(new THREE.Vector3(pos.x, bottom + height * 0.955, pos.z), quat, one);
      bandMesh.setMatrixAt(i * 2 + 1, mat);
    }
  }

  shafts.instanceMatrix.needsUpdate = true;
  if (baseMesh) baseMesh.instanceMatrix.needsUpdate = true;
  if (bandMesh) bandMesh.instanceMatrix.needsUpdate = true;

  return { group, topY: top };
}

/**
 * 鼓座：托住上层柱圈的圆筒墙（带红墙、彩画带与竖向分格）
 */
export interface DrumOptions {
  radius: number;
  bottom: number;
  top: number;
  /** 立柱（附于墙上）数量 */
  columnCount: number;
  columnRadius: number;
}

export function buildDrum(opts: DrumOptions): THREE.Group {
  const mats = getMaterials();
  const { radius: R, bottom, top } = opts;
  const h = top - bottom;
  const group = new THREE.Group();
  group.name = 'drum';

  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, h, 96, 1, true),
    mats.timberRed,
  );
  wall.position.y = bottom + h / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  // 檐下彩画带
  const frieze = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.012, R + 0.012, Math.min(1.5, h * 0.26), 96, 1, true),
    caissonRing(TAU * (R + 0.012), 1.6),
  );
  frieze.position.y = top - Math.min(1.5, h * 0.26) / 2;
  frieze.castShadow = true;
  frieze.receiveShadow = true;
  group.add(frieze);

  // 收分压顶
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.16, R + 0.16, 0.14, 96), mats.marble);
  cap.position.y = top + 0.07;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  return group;
}
