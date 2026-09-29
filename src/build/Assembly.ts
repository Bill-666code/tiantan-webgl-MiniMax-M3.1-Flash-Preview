/**
 * 装配：把台基、殿身、柱圈、斗拱、三重檐、鎏金宝顶组织成
 * 可独立位移的"层"(Layer)，供爆炸 / 重组动画使用。
 */
import * as THREE from 'three';
import { BUILDING } from '../config';
import type { LevelSpec, QualityProfile } from '../config';
import { buildBody } from './body';
import { buildColumnRing, buildDrum } from './columns';
import { buildDougongRing } from './dougong';
import { buildFinial } from './finial';
import { buildRoof } from './roof';
import type { RoofResult } from './roof';
import { buildTerrace } from './terrace';

export interface Layer {
  id: string;
  label: string;
  object: THREE.Object3D;
  /** 爆炸位移向量 */
  offset: THREE.Vector3;
  /** 过渡期间的附加旋转（弧度） */
  twist: number;
}

export interface AssemblyResult {
  root: THREE.Group;
  layers: Layer[];
  /** 各层原始高度区间（用于分层线框） */
  levelInfo: LevelSpec[];
}

export function buildAssembly(quality: QualityProfile): AssemblyResult {
  const root = new THREE.Group();
  root.name = 'tiantan';
  const layers: Layer[] = [];

  const terrace = buildTerrace();
  terrace.base.name = 'terrace-base';
  root.add(terrace.base);
  layers.push({ id: 'terrace', label: '三层汉白玉台基', object: terrace.base, offset: new THREE.Vector3(0, -4.2, 0), twist: 0 });

  root.add(terrace.stairs);
  layers.push({ id: 'stairs', label: '中央石阶 · 御路', object: terrace.stairs, offset: new THREE.Vector3(0, -2.2, 8.5), twist: 0.02 });

  root.add(terrace.railings);
  layers.push({
    id: 'railings',
    label: '栏杆 · 望柱',
    object: terrace.railings,
    offset: new THREE.Vector3(0, -0.9, 0),
    twist: 0.05,
  });

  // ---- 殿身 ----
  const body = buildBody();
  root.add(body.group);
  layers.push({ id: 'body', label: '殿身墙体 · 门窗', object: body.group, offset: new THREE.Vector3(0, 1.6, 0), twist: -0.03 });

  // ---- 逐层：柱圈 → 斗拱 → 屋顶 ----
  const roofs: RoofResult[] = [];
  BUILDING.levels.forEach((level, i) => {
    const idx = i;

    // 鼓座（承托本层柱圈）
    let drum: THREE.Group | null = null;
    if (level.drumRadius > 0) {
      const below = roofs[i - 1];
      const bottom = below ? below.surfaceYAt(level.drumRadius) + 0.05 : BUILDING.tiers[2].top;
      drum = buildDrum({
        radius: level.drumRadius,
        bottom,
        top: level.columnTop + 0.02,
        columnCount: level.columnCount,
        columnRadius: level.columnRadiusSize,
      });
      root.add(drum);
    }

    // 鼓座层的柱子附在筒壁外侧，露出半柱以形成层间柱廊
    const colR = level.drumRadius > 0 ? level.drumRadius + 0.3 : level.columnRadius;

    const columns = buildColumnRing({
      count: level.columnCount,
      radius: colR,
      bottom: level.columnBottom,
      top: level.columnTop,
      columnRadius: level.columnRadiusSize,
      base: drum === null,
    });
    columns.group.name = `columns-${level.name}`;
    root.add(columns.group);

    const dougong = buildDougongRing({
      radius: colR,
      count: level.dougongCount,
      tiers: level.dougongTiers,
      baseY: level.columnTop + 0.06,
    });
    root.add(dougong.group);

    const roof = buildRoof(level, {
      radialSegments: quality.roofRadialSegments,
      profileSegments: quality.roofProfileSegments,
    });
    roof.object.name = `roof-${level.name}`;
    root.add(roof.object);
    roofs.push(roof);

    // ---- 爆炸参数：逐层抬高并向外扩张 ----
    const upStep = 4.6 + idx * 5.4;
    const radial = 4.6 + idx * 5.2;

    if (drum) {
      layers.push({
        id: `drum-${idx}`,
        label: `${level.name}鼓座`,
        object: drum,
        offset: new THREE.Vector3(0, upStep - 1.6, 0),
        twist: 0.06 * (idx + 1),
      });
    }
    layers.push({
      id: `columns-${idx}`,
      label: `${level.name}柱圈`,
      object: columns.group,
      offset: new THREE.Vector3(radial * 0.55, upStep - 1.2, 0),
      twist: -0.05,
    });
    layers.push({
      id: `dougong-${idx}`,
      label: `${level.name}斗拱`,
      object: dougong.group,
      offset: new THREE.Vector3(radial * 0.8, upStep + 0.8, 0),
      twist: 0.07,
    });
    layers.push({
      id: `roof-${idx}`,
      label: `${level.name}屋顶`,
      object: roof.object,
      offset: new THREE.Vector3(radial, upStep + 3.2, 0),
      twist: 0.09 * (idx + 1),
    });
  });

  // ---- 鎏金宝顶（坐落于顶层屋顶的顶点）----
  const topRoof = roofs[roofs.length - 1];
  const finial = buildFinial();
  finial.position.y = topRoof.profile[0].y - 0.18;
  root.add(finial);
  layers.push({
    id: 'finial',
    label: '鎏金宝顶',
    object: finial,
    offset: new THREE.Vector3(0, 37.5, 0),
    twist: 0.16,
  });

  return { root, layers, levelInfo: BUILDING.levels };
}
