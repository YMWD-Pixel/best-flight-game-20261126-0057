// Screenshot staging: ?shot=start|play|end (with &seed=) paints one scene
// instead of running the loop, twice, then sets window.__shotReady so a
// screenshot tool knows the frame is settled. The scenes are the real game
// running — title, mid-flight, and the end screen — never a mock-up.

export const SHOT_START = 'start';
export const SHOT_PLAY = 'play';
export const SHOT_END = 'end';

/**
 * Put the plane + world into the named scene. Returns the screen the HUD
 * should show: 'title' | 'play' | 'end'. The seed picks where on the ring
 * tour a play shot starts, so different seeds frame different rings.
 */
export function stageShot(name, plane, world, seed = 1) {
  if (name === SHOT_START) {
    // Parked on the Coral Bay strip, title screen over the scene.
    plane.reset({ x: -900, y: 6.4 + 1.7, z: 760, heading: 0.35, speed: 0, throttle: 0 });
    world.start('ring');
    world.state.running = false;
    world.state.message = '';
    return 'title';
  }
  if (name === SHOT_END) {
    // Just landed at Coral Bay after a finished Island Hop.
    plane.reset({ x: -900, y: 6.4 + 1.7, z: 700, heading: 0.35, speed: 0, throttle: 0 });
    plane.state.landed = true;
    plane.state.landedRunway = { name: 'Coral Bay' };
    world.start('hop');
    world.state.score = 640;
    world.state.hopsDone = 3;
    world.state.hopIndex = 3;
    world.finish('All three strips visited! Final score 640.');
    return 'end';
  }
  // SHOT_PLAY: mid-flight, chasing a ring over the Isles, HUD live.
  world.start('ring');
  const rings = world.state.rings;
  const leg = Math.abs(seed) % 5;
  const target = rings[Math.min(leg + 1, rings.length - 1)];
  const prev = rings[leg];
  rings.forEach((r, i) => { if (i < target.index) r.passed = true; });
  world.state.nextRing = target.index;
  world.state.score = target.index * 100;
  world.state.timeLeft = 300 - target.index * 12;
  const dx = target.x - prev.x;
  const dz = target.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  const heading = Math.atan2(-dx, -dz);
  plane.reset({
    x: target.x - (dx / len) * 260,
    y: target.y + 15,
    z: target.z - (dz / len) * 260,
    heading,
    speed: 52,
    throttle: 0.72,
    airborne: true,
  });
  plane.state.pitch = 0.04;
  plane.state.roll = -0.08;
  world.state.message = `Ring ${target.index + 1} ahead — 260 m`;
  world.state.messageUntil = 999;
  return 'play';
}
