/**
 * 殿身：圆形墙体 + 槅扇门 + 步步锦窗
 * ------------------------------------------------------------------
 * 墙体为整张圆筒，用 alphaMap 在门窗位置开洞（真实通透），
 * 洞内嵌暗色内壁；门窗构件全部实例化。
 */
import * as THREE from 'three';
import { BUILDING } from '../config';
import { caissonRing, getMaterials, marbleRing } from '../gfx/materials';
import { wallAlphaTexture } from '../gfx/textures';
import { TAU } from './roofProfile';

const B = BUILDING.body;

export interface BodyResult {
  group: THREE.Group;
  bayAngle(index: number): number;
}

export function buildBody(): BodyResult {
  const mats = getMaterials();
  const group = new THREE.Group();
  group.name = 'body';

  const R = B.radius;
  const bottom = B.bottom;
  const top = B.top;
  const bays = B.columns;
  const bayAngle = (i: number) => (i / bays) * TAU;

  const dadoTop = bottom + B.dadoHeight;
  const wallBottom = dadoTop;
  const wallTop = B.friezeBottom;

  // ---- 墙裙（汉白玉）----
  const dado = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, B.dadoHeight, 96, 1, true),
    marbleRing(TAU * R, B.dadoHeight, 1.6),
  );
  dado.position.y = bottom + B.dadoHeight / 2;
  dado.castShadow = true;
  dado.receiveShadow = true;
  group.add(dado);

  // ---- 主体红墙（带门窗洞口）----
  const alpha = wallAlphaTexture(bays, [...B.doorBays], wallBottom, wallTop, wallBottom + B.doorHeight, B.windowTop);
  const wallMat = mats.timberRed.clone();
  wallMat.alphaMap = alpha;
  wallMat.transparent = false;
  wallMat.alphaTest = 0.5;
  wallMat.side = THREE.DoubleSide;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, wallTop - wallBottom, 128, 1, true), wallMat);
  wall.position.y = (wallBottom + wallTop) / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  // ---- 额枋彩画带 ----
  const frieze = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.02, R + 0.02, B.friezeTop - B.friezeBottom, 128, 1, true),
    caissonRing(TAU * (R + 0.02), 1.75),
  );
  frieze.position.y = (B.friezeBottom + B.friezeTop) / 2;
  frieze.castShadow = true;
  frieze.receiveShadow = true;
  group.add(frieze);

  // 额枋上下压边
  for (const [y, h] of [
    [B.friezeBottom - 0.09, 0.18],
    [B.friezeTop + 0.09, 0.18],
  ] as const) {
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.06, R + 0.06, h, 128), mats.goldDim);
    edge.position.y = y;
    edge.castShadow = true;
    edge.receiveShadow = true;
    group.add(edge);
  }

  // ---- 内部暗壁（透过门窗可见）----
  const interior = new THREE.Mesh(
    new THREE.CylinderGeometry(B.interiorRadius, B.interiorRadius, top - bottom + 2, 64, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x1d1512, roughness: 1, metalness: 0, side: THREE.BackSide }),
  );
  interior.position.y = bottom + (top - bottom) / 2;
  group.add(interior);

  // 室内微弱暖光（避免门窗后一片死黑）
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(B.interiorRadius - 0.05, B.interiorRadius - 0.05, 0.6, 48),
    new THREE.MeshBasicMaterial({ color: 0xffca7a, side: THREE.BackSide }),
  );
  glow.position.y = wallBottom + B.doorHeight * 0.75;
  group.add(glow);

  // ---- 门 / 窗 ----
  const doorBays = new Set<number>(B.doorBays);
  const windowBays: number[] = [];
  for (let i = 0; i < bays; i++) if (!doorBays.has(i)) windowBays.push(i);

  const bayWidth = (TAU * R) / bays;
  const panelWidth = bayWidth * 0.9;

  // 槅扇门：每扇门两片
  const leafW = panelWidth / 2;
  const leafH = B.doorHeight;
  const leafGeo = new THREE.PlaneGeometry(leafW, leafH);
  const doorLeaves = new THREE.InstancedMesh(leafGeo, mats.lattice, doorBays.size * 2);
  doorLeaves.castShadow = true;
  doorLeaves.receiveShadow = true;
  group.add(doorLeaves);

  // 裙板（门下实心部分）
  const skirtGeo = new THREE.PlaneGeometry(leafW, leafH * 0.28);
  const doorSkirts = new THREE.InstancedMesh(skirtGeo, mats.lacquer, doorBays.size * 2);
  doorSkirts.castShadow = false;
  doorSkirts.receiveShadow = true;
  group.add(doorSkirts);

  // 门框：上槛（横）+ 两侧门颊（竖）
  const headGeo = new THREE.BoxGeometry(panelWidth + 0.2, 0.18, 0.24);
  const doorHeads = new THREE.InstancedMesh(headGeo, mats.goldDim, doorBays.size);
  doorHeads.castShadow = true;
  doorHeads.receiveShadow = true;
  group.add(doorHeads);

  const jambGeo = new THREE.BoxGeometry(0.18, leafH + 0.2, 0.24);
  const doorJambs = new THREE.InstancedMesh(jambGeo, mats.goldDim, doorBays.size * 2);
  doorJambs.castShadow = true;
  doorJambs.receiveShadow = true;
  group.add(doorJambs);

  // 窗
  const winH = B.windowTop - B.windowBottom;
  const winGeo = new THREE.PlaneGeometry(panelWidth, winH);
  const windows = new THREE.InstancedMesh(winGeo, mats.latticeWindow, windowBays.length);
  windows.castShadow = true;
  windows.receiveShadow = true;
  group.add(windows);

  // 窗框 + 窗台
  const winFrameGeo = new THREE.BoxGeometry(panelWidth + 0.16, 0.14, 0.2);
  const winFrames = new THREE.InstancedMesh(winFrameGeo, mats.goldDim, windowBays.length * 2);
  winFrames.castShadow = true;
  group.add(winFrames);

  const sillGeo = new THREE.BoxGeometry(panelWidth + 0.3, 0.12, 0.34);
  const sills = new THREE.InstancedMesh(sillGeo, mats.marble, windowBays.length + doorBays.size);
  sills.castShadow = true;
  sills.receiveShadow = true;
  group.add(sills);

  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const panelR = R - 0.12;
  let sillIdx = 0;

  const place = (index: number, rho: number, y: number, extraAngle = 0) => {
    const th = bayAngle(index) + extraAngle;
    pos.set(rho * Math.sin(th), y, rho * Math.cos(th));
    quat.setFromAxisAngle(yAxis, th);
    mat4.compose(pos, quat, new THREE.Vector3(1, 1, 1));
    return mat4;
  };

  // ---- 门 ----
  let li = 0;
  let hi = 0;
  let ji = 0;
  const one = new THREE.Vector3(1, 1, 1);
  for (const bay of B.doorBays) {
    const th = bayAngle(bay);
    for (const side of [-1, 1]) {
      const offset = side * (leafW / 2);
      const px = panelR * Math.sin(th) + side * Math.cos(th) * offset;
      const pz = panelR * Math.cos(th) - side * Math.sin(th) * offset;
      quat.setFromAxisAngle(yAxis, th + Math.PI / 2);
      pos.set(px, wallBottom + leafH / 2, pz);
      mat4.compose(pos, quat, one);
      doorLeaves.setMatrixAt(li, mat4);

      pos.set(px, wallBottom + leafH * 0.14, pz);
      mat4.compose(pos, quat, one);
      doorSkirts.setMatrixAt(li, mat4);
      li++;
    }
    // 上槛
    mat4.copy(place(bay, panelR, wallBottom + leafH + 0.12));
    doorHeads.setMatrixAt(hi++, mat4);
    // 两侧门颊
    for (const side of [-1, 1]) {
      const off = side * (panelWidth / 2 + 0.09);
      pos.set(
        panelR * Math.sin(th) + side * Math.cos(th) * off,
        wallBottom + leafH / 2,
        panelR * Math.cos(th) - side * Math.sin(th) * off,
      );
      quat.setFromAxisAngle(yAxis, th);
      mat4.compose(pos, quat, one);
      doorJambs.setMatrixAt(ji++, mat4);
    }
    // 门槛石
    mat4.copy(place(bay, panelR, wallBottom - 0.06));
    sills.setMatrixAt(sillIdx++, mat4);
  }

  // ---- 窗 ----
  let wi = 0;
  let wfi = 0;
  for (const bay of windowBays) {
    mat4.copy(place(bay, panelR, B.windowBottom + winH / 2));
    windows.setMatrixAt(wi++, mat4);

    mat4.copy(place(bay, panelR, B.windowTop + 0.09));
    winFrames.setMatrixAt(wfi++, mat4);
    mat4.copy(place(bay, panelR, B.windowBottom - 0.09));
    winFrames.setMatrixAt(wfi++, mat4);

    mat4.copy(place(bay, panelR, B.windowBottom - 0.2));
    sills.setMatrixAt(sillIdx++, mat4);
  }

  for (const m of [doorLeaves, doorSkirts, doorHeads, doorJambs, windows, winFrames, sills]) {
    m.instanceMatrix.needsUpdate = true;
  }

  return { group, bayAngle };
}
