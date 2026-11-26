// The 3D view: sky dome, sun, drifting clouds, the chase camera, and the
// per-frame updates of the plane, rings and crates. Nothing here knows the
// rules — it only draws what the world and the plane report.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WORLD } from './config.js';
import { buildWorld } from './terrain.js';
import { buildCrateMeshes, buildRingMeshes } from './world.js';
import { createRandom } from './noise.js';

function buildSky(scene) {
  const geo = new THREE.SphereGeometry(6000, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vPos;
      void main() {
        float t = clamp(normalize(vPos).y * 0.5 + 0.55, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, t), 1.0);
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(180, 32),
    new THREE.MeshBasicMaterial({ color: PALETTE.sun, fog: false }),
  );
  sun.position.set(2600, 1500, -4200);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
}

function buildClouds(scene) {
  const rng = createRandom(777);
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: PALETTE.cloud, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 46; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < puffs; j += 1) {
      const r = 18 + rng() * 26;
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      puff.position.set((rng() - 0.5) * 90, (rng() - 0.5) * 12, (rng() - 0.5) * 40);
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(
      (rng() - 0.5) * WORLD.size * 1.4,
      260 + rng() * 260,
      (rng() - 0.5) * WORLD.size * 1.4,
    );
    group.add(cloud);
    clouds.push({ group: cloud, speed: 2 + rng() * 3 });
  }
  scene.add(group);
  return clouds;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe0ea, WORLD.fogNear, WORLD.fogFar);

  const hemi = new THREE.HemisphereLight(0xbfd9ea, 0x3d5a3a, 1.25);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);
  const sunLight = new THREE.DirectionalLight(0xfff1c4, 1.6);
  sunLight.position.set(1400, 1800, -900);
  scene.add(sunLight);

  buildSky(scene);
  buildWorld(scene);
  const clouds = buildClouds(scene);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 12000);
  camera.position.set(-900, 80, 820);

  const camPos = new THREE.Vector3(-900, 80, 820);
  const camLook = new THREE.Vector3(-900, 60, 700);
  const tmp = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  let ringVisuals = null;
  let crateVisuals = null;

  function setMissionVisuals(world) {
    if (ringVisuals) {
      scene.remove(ringVisuals.group);
      ringVisuals = null;
    }
    if (crateVisuals) {
      scene.remove(crateVisuals.group);
      crateVisuals = null;
    }
    if (world.state.missionId === 'ring') {
      ringVisuals = buildRingMeshes(world.state.rings);
      scene.add(ringVisuals.group);
    } else if (world.state.missionId === 'free') {
      crateVisuals = buildCrateMeshes(world.state.crates);
      scene.add(crateVisuals.group);
    }
  }

  /** Where the chase camera wants to be for this plane state. */
  function chaseTargets(plane, posOut, lookOut) {
    const p = plane.state;
    const back = 34 + p.speed * 0.14;
    const up = 11 + p.speed * 0.035;
    posOut.set(
      p.pos.x + Math.sin(p.heading) * back,
      Math.max(p.pos.y + up, 12),
      p.pos.z + Math.cos(p.heading) * back,
    );
    lookOut.set(
      p.pos.x - Math.sin(p.heading) * 30,
      p.pos.y + Math.sin(p.pitch) * 18 + 4,
      p.pos.z - Math.cos(p.heading) * 30,
    );
  }

  /** Jump the camera straight to its chase position (screenshots). */
  function snapCamera(plane) {
    chaseTargets(plane, camPos, camLook);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  /** Draw one frame. plane = the plane object, world = the mission world. */
  function draw(plane, world, dt, time) {
    const p = plane.state;
    // Chase camera: behind and above the plane, looking a little ahead.
    // Far enough back that the whole aircraft reads in frame.
    chaseTargets(plane, tmp, tmpLook);
    camPos.lerp(tmp, 1 - Math.exp(-5 * dt));
    camera.position.copy(camPos);
    camLook.lerp(tmpLook, 1 - Math.exp(-8 * dt));
    camera.lookAt(camLook);
    // Gentle roll with the plane, and a wider view at speed.
    camera.rotation.z += p.roll * 0.12;
    camera.fov = 62 + Math.min(14, p.speed * 0.16);
    camera.updateProjectionMatrix();

    // Rings: the next one pulses green, passed ones fade out.
    if (ringVisuals) {
      for (const { mesh, mat, ring } of ringVisuals.meshes) {
        if (ring.passed) {
          mat.color.setHex(PALETTE.ringNext);
          mesh.scale.setScalar(Math.max(0.01, mesh.scale.x - dt * 1.5));
          mesh.visible = mesh.scale.x > 0.05;
        } else if (ring.index === world.state.nextRing) {
          mat.color.setHex(PALETTE.ringNext);
          const pulse = 1 + Math.sin(time * 5) * 0.06;
          mesh.scale.setScalar(pulse);
        } else {
          mat.color.setHex(PALETTE.ring);
          mesh.scale.setScalar(1);
        }
      }
    }
    // Crates bob and spin; taken ones vanish.
    if (crateVisuals) {
      for (const { mesh, crate } of crateVisuals.meshes) {
        if (crate.taken) {
          mesh.visible = false;
        } else {
          mesh.visible = true;
          mesh.position.y = crate.y + Math.sin(time * 1.2 + crate.bob) * 3;
          mesh.rotation.y += dt * 0.6;
        }
      }
    }
    // Clouds drift with the wind.
    for (const c of clouds) {
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > WORLD.size) c.group.position.x = -WORLD.size;
    }

    plane.applyToMesh();
    renderer.render(scene, camera);
  }

  return { draw, setMissionVisuals, snapCamera, resize, scene, camera, renderer };
}
