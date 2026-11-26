// Missions, rings, cargo crates and scoring. Three ways to fly the Isles:
//
//  RING RUN — fly through 10 glowing rings in order before the clock runs
//    out. Each ring pays points and a little fuel; the centre pays extra.
//  ISLAND HOP — land on all three airstrips in order. A gentle touchdown
//    pays, a smooth one pays more.
//  FREE FLIGHT — collect 12 drifting cargo crates, no clock, no pressure.
//
// The world keeps the mission state; the renderer draws the rings and
// crates from the lists here.

import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS, PALETTE, SCORE } from './config.js';
import { RUNWAYS, groundHeight } from './terrain.js';
import { createRandom } from './noise.js';

export const MISSION_DEFS = [
  {
    id: 'ring',
    name: 'Ring Run',
    blurb: 'Thread 10 rings over the Isles before the clock runs out. Rings pay fuel.',
    key: '1',
  },
  {
    id: 'hop',
    name: 'Island Hop',
    blurb: 'Land on all three airstrips in order — Coral Bay, Gull Rock, Turtle Cay.',
    key: '2',
  },
  {
    id: 'free',
    name: 'Free Flight',
    blurb: 'No clock, no orders. Collect 12 cargo crates drifting over the sea.',
    key: '3',
  },
];

function ringPath() {
  // A tour of the archipelago: low over the bay, around the peaks, home.
  // Altitudes stay well above the tallest ridge (~250 m) so every ring is
  // reachable in clear air and readable against the sky.
  const pts = [
    [-900, 280, 420], [-620, 290, 120], [-300, 300, -180], [150, 310, -550],
    [700, 300, -700], [950, 280, -350], [1150, 290, 250], [900, 300, 850],
    [400, 280, 1050], [-900, 260, 700],
  ];
  return pts.map(([x, y, z], i) => ({
    x, y, z, radius: 16, index: i, passed: false, perfect: false,
  }));
}

function crateSpots(seed) {
  const rng = createRandom(seed);
  const spots = [];
  while (spots.length < MISSIONS.FREE_FLIGHT.crates) {
    const a = rng() * Math.PI * 2;
    const r = 350 + rng() * 1200;
    const x = -200 + Math.cos(a) * r;
    const z = 100 + Math.sin(a) * r;
    if (groundHeight(x, z) > 2) continue;
    spots.push({ x, y: 70 + rng() * 90, z, taken: false, bob: rng() * Math.PI * 2 });
  }
  return spots;
}

export function createWorld(seed = 20261126) {
  const state = {
    missionId: 'ring',
    rings: ringPath(),
    nextRing: 0,
    crates: crateSpots(seed),
    cratesGot: 0,
    hopIndex: 0, // which runway is next in Island Hop
    hopsDone: 0,
    score: 0,
    timeLeft: MISSIONS.RING_RUN.timeLimit,
    running: false,
    finished: false,
    finishText: '',
    message: '',
    messageUntil: 0,
    lastEvent: null, // { kind, at }
  };

  function start(missionId) {
    state.missionId = missionId;
    state.rings = ringPath();
    state.nextRing = 0;
    state.crates = crateSpots(seed);
    state.cratesGot = 0;
    state.hopIndex = 0;
    state.hopsDone = 0;
    state.score = 0;
    state.timeLeft = MISSIONS.RING_RUN.timeLimit;
    state.running = true;
    state.finished = false;
    state.finishText = '';
    state.message = missionId === 'ring'
      ? 'Ring 1 of 10 — follow the green ring!'
      : missionId === 'hop'
        ? 'Land at Coral Bay first — gentle and slow.'
        : 'Collect the crates — 12 drifting over the sea.';
    state.messageUntil = 6;
    state.lastEvent = null;
  }

  function flash(message, seconds, event) {
    state.message = message;
    state.messageUntil = seconds;
    if (event) state.lastEvent = event;
  }

  function finish(text) {
    state.running = false;
    state.finished = true;
    state.finishText = text;
  }

  function ringTarget() {
    return state.missionId === 'ring' && state.nextRing < state.rings.length
      ? state.rings[state.nextRing]
      : null;
  }

  function hopTarget() {
    return state.missionId === 'hop' ? RUNWAYS[state.hopIndex] ?? null : null;
  }

  /** Check ring passes, crate pickups and the clock. plane = plane state. */
  function step(dt, plane, now) {
    if (!state.running || state.finished) return;
    if (state.missionId === 'ring') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        finish(`Time up — ${state.nextRing} of ${state.rings.length} rings flown. Score ${state.score}.`);
        return;
      }
    }
    if (state.messageUntil > 0) state.messageUntil -= dt;

    const p = plane.pos;
    // Rings.
    const target = ringTarget();
    if (target) {
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      const dz = p.z - target.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const radial = Math.sqrt(dx * dx + dz * dz);
      // Passing through the ring's plane near its centre counts.
      if (dist < target.radius + 6 && Math.abs(dy) < 10) {
        const centre = Math.sqrt(dx * dx + dz * dz) < target.radius * 0.4;
        target.passed = true;
        target.perfect = centre;
        state.nextRing += 1;
        const pts = SCORE.ring + (centre ? SCORE.perfectRing : 0);
        state.score += pts;
        plane.fuel = Math.min(100, plane.fuel + 12);
        flash(
          centre ? `PERFECT — through the centre! +${pts}` : `Ring ${target.index + 1} cleared! +${pts}`,
          2.5,
          { kind: 'ring', perfect: centre },
        );
        if (state.nextRing >= state.rings.length) {
          const bonus = Math.round(state.timeLeft) * SCORE.ringTimeBonus;
          state.score += bonus;
          finish(`All 10 rings! Time bonus +${bonus}. Final score ${state.score}.`);
        }
      } else if (radial < target.radius * 3 && dist < 260) {
        state.message = `Ring ${target.index + 1} ahead — ${Math.round(dist)} m`;
        state.messageUntil = 0.4;
      }
    }
    // Crates.
    if (state.missionId === 'free') {
      for (const c of state.crates) {
        if (c.taken) continue;
        const d = Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2);
        if (d < 14) {
          c.taken = true;
          state.cratesGot += 1;
          state.score += SCORE.crate;
          flash(`Crate collected! ${state.cratesGot} of ${state.crates.length}  +${SCORE.crate}`, 2, { kind: 'crate' });
          if (state.cratesGot >= state.crates.length) {
            finish(`All ${state.crates.length} crates collected! Final score ${state.score}.`);
          }
        }
      }
    }
  }

  /** Called when the plane lands. Returns points earned (0 if not a hop stop). */
  function onLanding(runway, plane) {
    if (state.missionId !== 'hop' || !state.running || state.finished) return 0;
    const target = hopTarget();
    if (!target || runway.name !== target.name) {
      flash(`Landed at ${runway.name} — the next stop is ${target ? target.name : 'done'}.`, 3);
      return 0;
    }
    const smooth = Math.abs(plane.verticalSpeed) < 6;
    const pts = SCORE.landing + (smooth ? SCORE.landingSmooth : 0);
    state.score += pts;
    state.hopsDone += 1;
    state.hopIndex += 1;
    if (state.hopIndex >= RUNWAYS.length) {
      finish(`All three strips visited! Final score ${state.score}.`);
    } else {
      flash(
        `${smooth ? 'Butter-smooth landing' : 'Down safe'} at ${runway.name}! +${pts} — next: ${RUNWAYS[state.hopIndex].name}.`,
        4,
        { kind: 'land' },
      );
    }
    return pts;
  }

  return { state, start, step, onLanding, ringTarget, hopTarget, flash, finish };
}

/** Build the visible ring meshes (torus + glow sprite) for a mission's rings. */
export function buildRingMeshes(rings) {
  const group = new THREE.Group();
  const meshes = [];
  for (const ring of rings) {
    const geo = new THREE.TorusGeometry(ring.radius, 1.6, 10, 40);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.ring });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(ring.x, ring.y, ring.z);
    // Face the tour direction: rings face the next ring in the path.
    const next = rings[(ring.index + 1) % rings.length];
    mesh.lookAt(next.x, next.y, next.z);
    group.add(mesh);
    meshes.push({ mesh, mat, ring });
  }
  return { group, meshes };
}

/** Build floating cargo crates for Free Flight. */
export function buildCrateMeshes(crates) {
  const group = new THREE.Group();
  const meshes = [];
  const boxMat = new THREE.MeshLambertMaterial({ color: PALETTE.crate });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x7a3c00 });
  for (const c of crates) {
    const m = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), boxMat);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1, 6.4), edgeMat);
    m.add(box, edge);
    m.position.set(c.x, c.y, c.z);
    group.add(m);
    meshes.push({ mesh: m, crate: c });
  }
  return { group, meshes };
}
