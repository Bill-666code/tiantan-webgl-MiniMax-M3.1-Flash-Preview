/**
 * 共享材质库
 * ------------------------------------------------------------------
 * 屋面 UV 中已把重复次数烘焙进顶点属性，因此同一材质可被三重屋顶共用，
 * 大幅减少纹理切换与显存占用。
 */
import * as THREE from 'three';
import { PALETTE } from '../config';
import {
  caissonTexture,
  goldMaps,
  lacquerTexture,
  latticeTexture,
  marbleMaps,
  pavingMaps,
  roofTileMaps,
  woodTexture,
} from './textures';

let cache: Materials | null = null;

export interface Materials {
  roofTop: THREE.MeshStandardMaterial;
  tileRoof: THREE.MeshStandardMaterial;
  roofBottom: THREE.MeshStandardMaterial;
  roofEdge: THREE.MeshStandardMaterial;
  eaveTile: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  marbleCarved: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshStandardMaterial;
  caisson: THREE.MeshStandardMaterial;
  bracketPaint: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  goldDim: THREE.MeshStandardMaterial;
  lattice: THREE.MeshStandardMaterial;
  latticeWindow: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  timberRed: THREE.MeshStandardMaterial;
  paving: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  foliagePine: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  wallRed: THREE.MeshStandardMaterial;
  windowGlow: THREE.MeshBasicMaterial;
}

export function getMaterials(): Materials {
  if (cache) return cache;

  const tiles = roofTileMaps();
  const marble = marbleMaps();
  const gold = goldMaps();
  const lacquer = lacquerTexture();
  const wood = woodTexture(512, 'dark');
  const woodRed = woodTexture(512, 'red');
  const paving = pavingMaps();

  cache = {
    roofTop: new THREE.MeshStandardMaterial({
      map: tiles.map,
      normalMap: tiles.normalMap,
      roughnessMap: tiles.roughnessMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.06,
      normalScale: new THREE.Vector2(0.62, 0.62),
      envMapIntensity: 1.05,
      side: THREE.FrontSide,
    }),

    roofBottom: new THREE.MeshStandardMaterial({
      map: wood.map,
      normalMap: wood.normalMap,
      roughnessMap: wood.roughnessMap,
      color: 0xf3ddc0,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 1.15,
      side: THREE.FrontSide,
    }),

    /** 灰瓦（院墙等非主体建筑） */
    tileRoof: new THREE.MeshStandardMaterial({
      color: 0x54585e,
      roughness: 0.72,
      metalness: 0.05,
      envMapIntensity: 0.8,
    }),

    roofEdge: new THREE.MeshStandardMaterial({
      color: 0x14488c,
      roughness: 0.3,
      metalness: 0.12,
      envMapIntensity: 1.25,
    }),

    eaveTile: new THREE.MeshStandardMaterial({
      color: 0x14488c,
      roughness: 0.28,
      metalness: 0.15,
      envMapIntensity: 1.3,
    }),

    marble: new THREE.MeshStandardMaterial({
      map: marble.map,
      normalMap: marble.normalMap,
      roughnessMap: marble.roughnessMap,
      roughness: 1,
      metalness: 0.02,
      envMapIntensity: 0.85,
    }),

    marbleCarved: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.62,
      metalness: 0.02,
      envMapIntensity: 0.85,
    }),

    stone: new THREE.MeshStandardMaterial({
      color: PALETTE.stoneGrey,
      roughness: 0.86,
      metalness: 0.02,
      envMapIntensity: 0.7,
    }),

    lacquer: new THREE.MeshStandardMaterial({
      map: lacquer.map,
      normalMap: lacquer.normalMap,
      roughnessMap: lacquer.roughnessMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.03,
      envMapIntensity: 0.8,
    }),

    caisson: new THREE.MeshStandardMaterial({
      map: caissonTexture(),
      roughness: 0.52,
      metalness: 0.12,
      envMapIntensity: 1,
    }),

    /** 斗拱：沿用彩画贴图但整体压暗，避免抢走屋顶的视觉重心 */
    bracketPaint: new THREE.MeshStandardMaterial({
      map: caissonTexture(),
      color: 0x8a8f96,
      roughness: 0.6,
      metalness: 0.08,
      envMapIntensity: 0.9,
    }),

    gold: new THREE.MeshStandardMaterial({
      map: gold.map,
      normalMap: gold.normalMap,
      roughnessMap: gold.roughnessMap,
      color: 0xffffff,
      roughness: 1,
      metalness: 0.95,
      envMapIntensity: 1.6,
    }),

    goldDim: new THREE.MeshStandardMaterial({
      color: 0x9c7a33,
      roughness: 0.48,
      metalness: 0.55,
      envMapIntensity: 1.05,
    }),

    lattice: new THREE.MeshStandardMaterial({
      map: latticeTexture(1, 7, 192, 1088),
      transparent: true,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.05,
      envMapIntensity: 0.9,
    }),

    latticeWindow: new THREE.MeshStandardMaterial({
      map: latticeTexture(1, 5, 224, 800),
      transparent: true,
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.05,
      envMapIntensity: 0.9,
    }),

    interior: new THREE.MeshStandardMaterial({
      color: PALETTE.interior,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
    }),

    timber: new THREE.MeshStandardMaterial({
      map: wood.map,
      normalMap: wood.normalMap,
      color: 0xb08a68,
      roughness: 0.85,
      metalness: 0.02,
    }),

    timberRed: new THREE.MeshStandardMaterial({
      map: woodRed.map,
      normalMap: woodRed.normalMap,
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.04,
      envMapIntensity: 0.9,
    }),

    paving: new THREE.MeshStandardMaterial({
      map: paving.map,
      normalMap: paving.normalMap,
      roughnessMap: paving.roughnessMap,
      color: 0xdcd8ce,
      roughness: 1,
      metalness: 0.02,
      envMapIntensity: 0.6,
    }),

    grass: new THREE.MeshStandardMaterial({
      color: PALETTE.soil,
      roughness: 0.95,
      metalness: 0,
    }),

    foliage: new THREE.MeshStandardMaterial({
      color: PALETTE.leaf,
      roughness: 0.88,
      metalness: 0,
      flatShading: true,
    }),

    foliagePine: new THREE.MeshStandardMaterial({
      color: PALETTE.pine,
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
    }),

    bark: new THREE.MeshStandardMaterial({
      color: 0x4a3a2c,
      roughness: 0.95,
      metalness: 0,
    }),

    wallRed: new THREE.MeshStandardMaterial({
      color: 0x8e2a21,
      roughness: 0.62,
      metalness: 0.03,
      envMapIntensity: 0.9,
    }),

    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  };

  return cache;
}

/**
 * 按实际尺寸生成可重复的石材材质
 * 旋转体的 UV 为 0~1，必须按周长/高度设置重复，否则石缝会被拉伸到几十米。
 */
const stoneRingCache = new Map<string, THREE.MeshStandardMaterial>();

export function marbleRing(circumference: number, height: number, tile = 2.2): THREE.MeshStandardMaterial {
  const rx = Math.max(1, Math.round(circumference / tile));
  const ry = Math.max(1, Math.round(height / tile));
  const key = `${rx}_${ry}_${tile}`;
  const hit = stoneRingCache.get(key);
  if (hit) return hit;
  const base = marbleMaps();
  const clone = (t: THREE.Texture): THREE.Texture => {
    const c = t.clone();
    c.wrapS = THREE.RepeatWrapping;
    c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };
  const mat = new THREE.MeshStandardMaterial({
    map: clone(base.map),
    normalMap: clone(base.normalMap),
    roughnessMap: clone(base.roughnessMap),
    roughness: 1,
    metalness: 0.02,
    envMapIntensity: 0.8,
  });
  stoneRingCache.set(key, mat);
  return mat;
}

/**
 * 按周长生成可重复的彩画材质
 * 一张彩画贴图内含 6 个旋子组，repeatX 由目标开间数决定，
 * 避免长条环面上彩画被拉伸变形。
 */
const ringCache = new Map<string, THREE.MeshStandardMaterial>();

export function caissonRing(circumference: number, panelWidth = 1.75, tone = 0xffffff): THREE.MeshStandardMaterial {
  const panels = Math.max(4, Math.round(circumference / panelWidth));
  const repeat = Math.max(1, Math.round(panels / 6));
  const key = `${repeat}_${tone}`;
  const hit = ringCache.get(key);
  if (hit) return hit;
  const tex = caissonTexture().clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(repeat, 1);
  tex.needsUpdate = true;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: tone,
    roughness: 0.54,
    metalness: 0.1,
    envMapIntensity: 1,
  });
  ringCache.set(key, mat);
  return mat;
}
