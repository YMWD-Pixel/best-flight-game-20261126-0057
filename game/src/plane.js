// The aircraft: a low-poly bush plane built from primitives, and the arcade
// flight model that flies it. The model is deliberately forgiving — bank to
// turn, pull to climb, throttle to go — with a stall below min speed so
// throttle and turn discipline actually matter.

import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, PLANE } from './config.js';
import { groundHeight, runwayAt } from './terrain.js';

/** Build the plane mesh. Returns { group, prop } — prop spins in the loop. */
export function buildPlaneMesh() {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: PALETTE.planeBody });
  const accentMat = new THREE.MeshLambertMaterial({ color: PALETTE.planeAccent });
  const wingMat = new THREE.MeshLambertMaterial({ color: PALETTE.planeWing });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fd8ef });

  // Fuselage: a tapered cylinder pointing -z (forward is -z in local space).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.55, 7.4, 10), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.z = 0.4;
  group.add(fuselage);
  // Nose cone and tail cone.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.2, 10), accentMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.8;
  group.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 8), bodyMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 5.2;
  group.add(tail);
  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 12, 8), glassMat);
  canopy.scale.set(0.95, 0.75, 1.9);
  canopy.position.set(0, 0.95, -1.1);
  group.add(canopy);
  // Main wing and tailplane.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.28, 2.4), wingMat);
  wing.position.set(0, 0.15, -0.6);
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 2.4), bodyMat);
  wingTipL.position.set(-6.6, 0.15, -0.6);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 6.6;
  group.add(wingTipL, wingTipR);
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 1.5), wingMat);
  tailplane.position.set(0, 0.35, 5.6);
  group.add(tailplane);
  // Fin.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.24, 2.4, 1.9), bodyMat);
  fin.position.set(0, 1.25, 5.7);
  group.add(fin);
  // Fixed gear: two wheels and struts.
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 10), darkMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.7, -1.55, -0.9);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), darkMat);
    strut.position.set(side * 1.55, -0.85, -0.9);
    strut.rotation.z = side * 0.35;
    group.add(wheel, strut);
  }
  // Propeller: hub + two blades, spun by the renderer.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), darkMat);
  prop.add(hub);
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.34, 4.6, 0.1), darkMat);
    blade.rotation.z = a;
    blade.position.y = 0;
    prop.add(blade);
  }
  prop.position.set(0, 0, -6.05);
  group.add(prop);
  // Wingtip navigation lights.
  const navL = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  navL.position.set(-6.85, 0.15, -0.6);
  const navR = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0x22ff66 }),
  );
  navR.position.set(6.85, 0.15, -0.6);
  group.add(navL, navR);

  group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group, prop };
}

export function createPlane() {
  const mesh = buildPlaneMesh();
  const state = {
    pos: new THREE.Vector3(-900, 60, 760),
    heading: 0.35, // radians, 0 = north (-z), grows clockwise
    pitch: 0, // nose up positive
    roll: 0, // right wing down positive
    speed: 0,
    throttle: 0,
    fuel: PLANE.fuelCapacity,
    verticalSpeed: 0,
    airborne: false,
    crashed: false,
    landed: false,
    landedRunway: null,
    propSpin: 0,
  };

  function reset(start) {
    state.pos.set(start.x, start.y, start.z);
    state.heading = start.heading;
    state.pitch = 0;
    state.roll = 0;
    state.speed = start.speed ?? 0;
    state.throttle = start.throttle ?? 0;
    state.fuel = PLANE.fuelCapacity;
    state.verticalSpeed = 0;
    state.airborne = start.airborne ?? false;
    state.crashed = false;
    state.landed = false;
    state.landedRunway = null;
  }

  /**
   * Advance the flight model one fixed step.
   * input: { pitch: -1..1 (pull positive), roll: -1..1 (right positive),
   *          throttle: 0..1, brake: boolean }
   * Returns 'crash' | 'landed' | null.
   */
  function step(dt, input) {
    if (state.crashed) return 'crash';
    if (state.landed) {
      // Rolling out on the runway: bleed speed, stay glued to the strip.
      state.speed = Math.max(0, state.speed - 14 * dt);
      const fwd = forward();
      state.pos.addScaledVector(fwd, state.speed * dt);
      state.pos.y = 6.4 + 1.7;
      state.roll *= 0.9;
      state.pitch *= 0.9;
      return null;
    }

    state.throttle = input.throttle;
    const flying = state.speed > PLANE.minSpeed;

    // Stick: pitch and roll rates, with gentler response at low speed.
    const authority = Math.min(1, state.speed / 40 + 0.25);
    state.pitch += input.pitch * PLANE.pitchRate * authority * dt;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -0.55, 0.6);
    state.roll += input.roll * PLANE.rollRate * authority * dt;
    state.roll = THREE.MathUtils.clamp(state.roll, -1.25, 1.25);
    // Hands off: wings level themselves, and the nose eases back to level.
    if (Math.abs(input.roll) < 0.05) state.roll -= state.roll * PLANE.autoLevel * dt;
    if (Math.abs(input.pitch) < 0.05) state.pitch -= state.pitch * 0.55 * dt;

    // Banked turn: heading follows the roll.
    state.heading += -Math.sin(state.roll) * PLANE.turnRate * dt * (flying ? 1 : 0.4);
    state.heading = (state.heading + Math.PI * 3) % (Math.PI * 2) - Math.PI;

    // Thrust vs drag.
    const thrust = state.fuel > 0 ? state.throttle * PLANE.accel : 0;
    const drag = PLANE.drag * state.speed * state.speed * 0.055;
    state.speed += (thrust - drag) * dt;
    if (input.brake) state.speed = Math.max(0, state.speed - 30 * dt);
    state.speed = THREE.MathUtils.clamp(state.speed, 0, PLANE.maxSpeed);

    // Vertical: climb from pitch while flying, sink when stalled or idle.
    let vy;
    if (flying) {
      vy = Math.sin(state.pitch) * state.speed * PLANE.climbFactor * 2.2
        + (state.throttle - 0.45) * 2.5;
    } else {
      vy = -PLANE.sinkRate * (1 - state.throttle * 0.4);
    }
    // Gentle gravity settle when parked on the ground with no speed.
    if (!state.airborne && state.speed < 4 && state.throttle < 0.1) vy = 0;

    const fwd = forward();
    state.pos.addScaledVector(fwd, state.speed * Math.cos(state.pitch) * dt);
    state.pos.y += vy * dt;
    state.verticalSpeed = vy;

    // Fuel burn.
    const burn = PLANE.fuelBurnIdle + (PLANE.fuelBurn - PLANE.fuelBurnIdle) * state.throttle;
    state.fuel = Math.max(0, state.fuel - burn * dt);

    // Ceiling.
    if (state.pos.y > 850) {
      state.pos.y = 850;
      state.pitch = Math.min(state.pitch, 0);
    }

    state.propSpin += (2 + state.throttle * 38) * dt;
    // Whether the plane was flying when this step began: the flag from the
    // last step, read before this step moves the plane, so a fast descent
    // still counts as arriving from the air when the gear touches. The flag
    // is gear-based — true while the wheels are off the ground — so it only
    // flips false at the very frame the gear meets the ground.
    const wasAirborne = state.airborne;
    state.airborne = state.pos.y - 1.7 > groundHeight(state.pos.x, state.pos.z) + 0.4;

    // Ground contact.
    const ground = groundHeight(state.pos.x, state.pos.z);
    const gearY = state.pos.y - 1.7;
    if (gearY <= ground + 0.4) {
      if (!wasAirborne) {
        // Already on the ground: roll along it, never crash. Taking off
        // from a strip, or taxiing after a landing, is safe ground.
        state.pos.y = ground + 1.7;
        if (state.throttle < 0.1) state.speed = Math.max(0, state.speed - 8 * dt);
        state.verticalSpeed = 0;
        return null;
      }
      const rw = runwayAt(state.pos.x, state.pos.z);
      const gentle = Math.abs(state.verticalSpeed) < PLANE.crashSpeed
        && state.speed < PLANE.landSpeedMax + 14
        && Math.abs(state.roll) < 0.5;
      if (rw && gentle) {
        state.landed = true;
        state.landedRunway = rw;
        state.pos.y = 6.4 + 1.7;
        return 'landed';
      }
      if (state.speed < 6 && Math.abs(state.verticalSpeed) < 6) {
        // Soft stop on grass: not a crash, just parked.
        state.speed = 0;
        state.pos.y = ground + 1.7;
        return null;
      }
      state.crashed = true;
      return 'crash';
    }
    return null;
  }

  function forward() {
    // Forward vector from heading + pitch (heading 0 = -z).
    return new THREE.Vector3(
      -Math.sin(state.heading) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      -Math.cos(state.heading) * Math.cos(state.pitch),
    );
  }

  function applyToMesh() {
    mesh.group.position.copy(state.pos);
    mesh.group.rotation.set(0, 0, 0);
    mesh.group.rotateY(state.heading);
    mesh.group.rotateX(-state.pitch);
    mesh.group.rotateZ(-state.roll);
    mesh.prop.rotation.z = state.propSpin;
  }

  return { state, mesh, step, reset, forward, applyToMesh };
}
