// The Azure Isles: one heightfield mesh for the whole archipelago, a sea plane,
// three airstrips, and the low-poly dressing (trees, cottages, a lighthouse,
// harbour boats) that makes the ground read as inhabited from the air.
//
// groundHeight(x, z) is the single source of truth for terrain height: the
// renderer builds the mesh from it and the flight model collides against it.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { createRandom, fbm2 } from './noise.js';

// Island centres (x, z), radius and peak height. The home island holds the
// main runway; the north and east islands hold the other two strips.
export const ISLANDS = [
  { x: -900, z: 700, r: 780, h: 150, seed: 11 }, // home — Coral Bay
  { x: 950, z: -650, r: 640, h: 190, seed: 23 }, // north — Gull Rock
  { x: 1150, z: 900, r: 560, h: 120, seed: 37 }, // east — Turtle Cay
  { x: -1250, z: -950, r: 480, h: 230, seed: 51 }, // west — Storm Peak
  { x: 150, z: 150, r: 300, h: 55, seed: 67 }, // centre — Little Anchor
  { x: -350, z: -1350, r: 330, h: 80, seed: 83 }, // south — Kelp Point
];

// Airstrips: flat ground is carved around each one. heading is the runway
// direction in radians (0 = north, -z).
export const RUNWAYS = [
  { name: 'Coral Bay', x: -900, z: 700, heading: 0.35, length: 340, width: 26 },
  { name: 'Gull Rock', x: 950, z: -650, heading: -0.5, length: 300, width: 24 },
  { name: 'Turtle Cay', x: 1150, z: 900, heading: 1.15, length: 280, width: 24 },
];

function islandBump(x, z, isl) {
  const dx = (x - isl.x) / isl.r;
  const dz = (z - isl.z) / isl.r;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1) return 0;
  const fall = Math.cos(d2 * Math.PI * 0.5);
  return isl.h * fall * fall;
}

function flattenNearRunways(x, z, h) {
  for (const rw of RUNWAYS) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    const along = dx * Math.sin(rw.heading) + dz * Math.cos(rw.heading);
    const across = dx * Math.cos(rw.heading) - dz * Math.sin(rw.heading);
    // Normalised distance from the strip centre: 0 at the centre, 1 at the
    // edge of the pad. Fully flat inside 70% of the pad, then a smooth
    // blend back to the island dome, so the strip never sits on a hillside.
    // The pad runs long along the strip, so the approach corridor stays
    // clear for a landing run.
    const e = Math.max(
      Math.abs(along) / (rw.length * 1.2),
      Math.abs(across) / (rw.width * 3),
    );
    if (e < 1) {
      const t = e < 0.7 ? 0 : (e - 0.7) / 0.3;
      const s = t * t * (3 - 2 * t);
      h = 6 + (h - 6) * s;
    }
  }
  return h;
}

/** Height of the ground at (x, z); 0 over open sea. */
export function groundHeight(x, z) {
  let h = 0;
  for (const isl of ISLANDS) h += islandBump(x, z, isl);
  if (h <= 0.5) return 0;
  // Rolling hills on top of the island dome, sharper ridges near the peaks.
  const rough = fbm2(x * 0.004, z * 0.004, 7, 4);
  const ridge = 1 - Math.abs(fbm2(x * 0.002 + 40, z * 0.002 - 17, 19, 3));
  h += rough * 14 + ridge * ridge * 26 * Math.min(1, h / 90);
  return flattenNearRunways(x, z, h);
}

function colourFor(h, x, z) {
  const c = new THREE.Color();
  if (h < 3) c.setHex(PALETTE.sand);
  else if (h < 55) {
    c.setHex(PALETTE.grass);
    const dry = fbm2(x * 0.01, z * 0.01, 31, 2) * 0.5 + 0.5;
    c.lerp(new THREE.Color(PALETTE.grassDry), dry * 0.45);
  } else if (h < 130) c.setHex(PALETTE.rock);
  else c.setHex(PALETTE.snow);
  return c;
}

function buildTerrainMesh() {
  const size = WORLD.size;
  const segs = 180;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colours = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const c = colourFor(h, x, z);
    colours[i * 3] = c.r;
    colours[i * 3 + 1] = c.g;
    colours[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

function buildSea() {
  const geo = new THREE.PlaneGeometry(WORLD.size * 2.4, WORLD.size * 2.4, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.sea });
  const sea = new THREE.Mesh(geo, mat);
  sea.position.y = WORLD.seaLevel - 1.5; // below the terrain mesh, so the
  // shallows never z-fight with the sea plane.
  sea.name = 'sea';
  return sea;
}

function buildRunwayStrip(rw) {
  const group = new THREE.Group();
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(rw.width, rw.length),
    new THREE.MeshLambertMaterial({ color: PALETTE.runway }),
  );
  strip.rotation.x = -Math.PI / 2;
  strip.rotation.z = -rw.heading;
  strip.position.set(rw.x, 6.4, rw.z);
  group.add(strip);
  // Centre dashes.
  const dashMat = new THREE.MeshBasicMaterial({ color: PALETTE.runwayLine });
  for (let d = -rw.length / 2 + 22; d < rw.length / 2 - 10; d += 34) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 16), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.rotation.z = -rw.heading;
    const lx = rw.x + Math.sin(rw.heading) * d;
    const lz = rw.z + Math.cos(rw.heading) * d;
    dash.position.set(lx, 6.6, lz);
    group.add(dash);
  }
  // Threshold chevrons at both ends.
  for (const end of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(rw.width * 0.8, 5), dashMat);
    bar.rotation.x = -Math.PI / 2;
    bar.rotation.z = -rw.heading;
    bar.position.set(
      rw.x + Math.sin(rw.heading) * end * (rw.length / 2 - 8),
      6.6,
      rw.z + Math.cos(rw.heading) * end * (rw.length / 2 - 8),
    );
    group.add(bar);
  }
  return group;
}

function buildTrees(scene) {
  const rng = createRandom(4242);
  const trunkGeo = new THREE.CylinderGeometry(0.7, 1.1, 6, 5);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const topGeo = new THREE.ConeGeometry(5.5, 14, 6);
  const topMat = new THREE.MeshLambertMaterial({ color: 0x2f7d3a });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 320);
  const tops = new THREE.InstancedMesh(topGeo, topMat, 320);
  const m = new THREE.Matrix4();
  let placed = 0;
  let guard = 0;
  while (placed < 320 && guard < 6000) {
    guard += 1;
    const x = (rng() - 0.5) * WORLD.size;
    const z = (rng() - 0.5) * WORLD.size;
    const h = groundHeight(x, z);
    if (h < 8 || h > 60) continue;
    let nearRunway = false;
    for (const rw of RUNWAYS) {
      const dx = x - rw.x;
      const dz = z - rw.z;
      if (Math.abs(dx) < 220 && Math.abs(dz) < 220) { nearRunway = true; break; }
    }
    if (nearRunway) continue;
    const s = 0.8 + rng() * 0.9;
    m.makeScale(s, s, s);
    m.setPosition(x, h + 3 * s, z);
    trunks.setMatrixAt(placed, m);
    m.setPosition(x, h + (6 + 7) * s, z);
    tops.setMatrixAt(placed, m);
    placed += 1;
  }
  trunks.count = placed;
  tops.count = placed;
  scene.add(trunks);
  scene.add(tops);
}

function buildVillage(scene) {
  // Cottages clustered near Coral Bay, plus a striped lighthouse on the point.
  const rng = createRandom(99);
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xf3e6c8 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xc65a3a });
  for (let i = 0; i < 26; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = 120 + rng() * 190;
    const x = -900 + Math.cos(a) * r;
    const z = 700 + Math.sin(a) * r;
    const h = groundHeight(x, z);
    if (h < 7 || h > 40) continue;
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 10), wallMat);
    walls.position.y = 3.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(9.5, 5, 4), roofMat);
    roof.position.y = 9.5;
    roof.rotation.y = Math.PI / 4;
    house.add(walls, roof);
    house.position.set(x, h, z);
    house.rotation.y = rng() * Math.PI;
    scene.add(house);
  }
  // Lighthouse on the home island's western point.
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 5.5, 34, 10),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  tower.position.y = 17;
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.8, 6, 10),
    new THREE.MeshLambertMaterial({ color: 0xd23c2e }),
  );
  band.position.y = 20;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
  );
  lamp.position.y = 36;
  lh.add(tower, band, lamp);
  lh.position.set(-1560, groundHeight(-1560, 620), 620);
  scene.add(lh);
}

function buildBoats(scene) {
  const rng = createRandom(7);
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const sailMat = new THREE.MeshLambertMaterial({ color: 0xff6b4a, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i += 1) {
    const a = rng() * Math.PI * 2;
    const r = 850 + rng() * 500;
    const x = -900 + Math.cos(a) * r;
    const z = 700 + Math.sin(a) * r;
    if (groundHeight(x, z) > 0.5) continue;
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(10, 2.5, 4), hullMat);
    hull.position.y = 1;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 12, 5), hullMat);
    mast.position.y = 7;
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(7, 9), sailMat);
    sail.position.set(0, 8, 0.5);
    boat.add(hull, mast, sail);
    boat.position.set(x, 0.4, z);
    boat.rotation.y = rng() * Math.PI * 2;
    scene.add(boat);
  }
}

/** Build every static piece of the world into the scene. */
export function buildWorld(scene) {
  scene.add(buildTerrainMesh());
  scene.add(buildSea());
  for (const rw of RUNWAYS) scene.add(buildRunwayStrip(rw));
  buildTrees(scene);
  buildVillage(scene);
  buildBoats(scene);
}

/** Is (x, z) over a runway, and if so which one? */
export function runwayAt(x, z) {
  for (const rw of RUNWAYS) {
    const dx = x - rw.x;
    const dz = z - rw.z;
    const along = dx * Math.sin(rw.heading) + dz * Math.cos(rw.heading);
    const across = dx * Math.cos(rw.heading) - dz * Math.sin(rw.heading);
    if (Math.abs(along) < rw.length / 2 && Math.abs(across) < rw.width / 2 + 4) return rw;
  }
  return null;
}
