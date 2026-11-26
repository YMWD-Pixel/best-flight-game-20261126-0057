// Boot and the one loop: input is read every frame, the plane and the world
// advance in fixed 1/60 s steps, and the renderer paints what is there. The
// game moves between four screens: title, play, paused and end.
//
// ?seed=N fixes the mission layout. ?shot=start|play|end stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.

import { BEST_KEY, STEP } from './config.js';
import { createPlane } from './plane.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MISSION_1, ACTION_MISSION_2, ACTION_MISSION_3, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { SHOT_END, SHOT_PLAY, SHOT_START, stageShot } from './shots.js';

const SCREEN_TITLE = 'title';
const SCREEN_PLAY = 'play';
const SCREEN_PAUSED = 'paused';
const SCREEN_END = 'end';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261126;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const root = document.getElementById('app');

const plane = createPlane();
const world = createWorld(seed);
const renderer = createRenderer(canvas);
renderer.scene.add(plane.mesh.group);

// Debug handle for play-testing from the console (and the automated
// checks): the live plane and mission state. Harmless in play.
window.__skyCourier = { plane, world };
const hud = createHud(root);
const audio = createAudio();
const input = createInput(canvas);

let screen = SCREEN_TITLE;
let best = 0;
try {
  best = Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
} catch {
  best = 0;
}
let accumulator = 0;
let last = performance.now();
let elapsed = 0;
let lowFuelWarned = false;

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function announce(message) {
  status.textContent = message;
}

function startMission(missionId) {
  audio.ensure();
  world.start(missionId);
  renderer.setMissionVisuals(world);
  plane.reset({ x: -900, y: 6.4 + 1.7, z: 760, heading: 0.35, speed: 0, throttle: 0 });
  input.setThrottle(0);
  lowFuelWarned = false;
  accumulator = 0;
  screen = SCREEN_PLAY;
  hud.hideScreen();
  announce(`Flying ${missionId}. Press W for throttle.`);
}

function endFlight(title, sub, bodyHtml) {
  screen = SCREEN_END;
  if (world.state.score > best) {
    best = world.state.score;
    saveBest(best);
  }
  audio.update(0, 0, false);
  hud.showEnd({
    title,
    sub,
    bodyHtml,
    score: world.state.score,
    best,
    onRestart: () => startMission(world.state.missionId),
    onQuit: () => toTitle(),
  });
  announce(`${title}. Score ${world.state.score}. Best ${best}.`);
}

function toTitle() {
  screen = SCREEN_TITLE;
  world.state.running = false;
  plane.reset({ x: -900, y: 6.4 + 1.7, z: 760, heading: 0.35, speed: 0, throttle: 0 });
  renderer.setMissionVisuals(world);
  hud.showTitle(best, startMission);
  announce('Azure Isles Sky Courier. Choose a mission to fly.');
}

function handleActions() {
  const actions = input.takeActions();
  if (actions & ACTION_MUTE) audio.setMuted(!audio.muted);
  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_MISSION_1) startMission('ring');
    else if (actions & ACTION_MISSION_2) startMission('hop');
    else if (actions & ACTION_MISSION_3) startMission('free');
    else if (actions & ACTION_CONFIRM) startMission('ring');
  } else if (screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      hud.showPause(
        () => { screen = SCREEN_PLAY; hud.hideScreen(); },
        () => toTitle(),
      );
      announce('Paused.');
    }
  } else if (screen === SCREEN_PAUSED) {
    if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
      screen = SCREEN_PLAY;
      hud.hideScreen();
      announce('Flying.');
    }
  } else if (screen === SCREEN_END) {
    if (actions & ACTION_RESTART || actions & ACTION_CONFIRM) startMission(world.state.missionId);
  }
}

function stepWorld(dt) {
  const inputState = input.read(dt);
  const result = plane.step(dt, inputState);
  const p = plane.state;
  if (p.fuel <= 0 && !lowFuelWarned) {
    lowFuelWarned = true;
    world.flash('FUEL EMPTY — gliding! Find a runway!', 4);
    audio.alarm();
  }
  world.step(dt, p, elapsed);
  const event = world.state.lastEvent;
  if (event) {
    world.state.lastEvent = null;
    if (event.kind === 'ring') audio.ring(event.perfect);
    else if (event.kind === 'crate') audio.crate();
    else if (event.kind === 'land') audio.land();
  }
  if (result === 'crash') {
    audio.crash();
    endFlight(
      'COURIER DOWN',
      'The Isles claim another plane.',
      `<p>The plane went down over the Azure Isles with a score of ${world.state.score}.</p>`,
    );
  } else if (result === 'landed') {
    audio.land();
    const pts = world.onLanding(p.landedRunway, p);
    if (world.state.finished) {
      endFlight('ROUTE COMPLETE', world.state.finishText, '');
    } else if (world.state.missionId === 'hop') {
      world.flash(`Down safe at ${p.landedRunway.name}! +${pts} — throttle up to take off again.`, 4);
      // Taking off again: the plane rolls, the pilot adds throttle.
      p.landed = false;
      p.landedRunway = null;
      p.pos.y = 6.4 + 1.7;
    } else {
      world.flash(`Landed at ${p.landedRunway.name}. Throttle up to take off again.`, 3);
      p.landed = false;
      p.landedRunway = null;
      p.pos.y = 6.4 + 1.7;
    }
  } else if (world.state.finished) {
    audio.land();
    endFlight('ROUTE COMPLETE', world.state.finishText, '');
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  elapsed += dt;
  handleActions();
  if (screen === SCREEN_PLAY) {
    accumulator += dt;
    while (accumulator >= STEP && screen === SCREEN_PLAY) {
      stepWorld(STEP);
      accumulator -= STEP;
    }
    if (screen !== SCREEN_PLAY) accumulator = 0;
  } else {
    accumulator = 0;
    if (screen === SCREEN_TITLE) {
      // Idle orbit over the bay behind the title card.
      const t = elapsed * 0.05;
      plane.state.pos.set(-900 + Math.sin(t) * 260, 150 + Math.sin(t * 0.7) * 20, 700 + Math.cos(t) * 260);
      plane.state.heading = t + Math.PI / 2;
      plane.state.pitch = 0;
      plane.state.roll = 0.3;
      plane.state.speed = 40;
    }
  }
  const p = plane.state;
  audio.update(p.throttle, p.speed, p.airborne);
  if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) hud.update(plane, world, dt);
  renderer.draw(plane, world, dt, elapsed);
}

function runShot(name) {
  const shotScreen = stageShot(name, plane, world, seed);
  renderer.setMissionVisuals(world);
  if (name === SHOT_START) {
    screen = SCREEN_TITLE;
    hud.showTitle(best, () => {});
  } else if (name === SHOT_END) {
    screen = SCREEN_END;
    hud.showEnd({
      title: 'ROUTE COMPLETE',
      sub: world.state.finishText,
      bodyHtml: '<p>Three strips, three gentle touchdowns — the courier route is done.</p>',
      score: world.state.score,
      best: Math.max(best, world.state.score),
      onRestart: () => {},
      onQuit: () => {},
    });
  } else {
    screen = SCREEN_PLAY;
    hud.hideScreen();
    hud.update(plane, world, 0);
  }
  let painted = 0;
  function paint() {
    // Snap the chase camera to the plane first, so the frame is already
    // composed; then paint twice and report ready.
    renderer.snapCamera(plane);
    renderer.draw(plane, world, 1 / 60, 3.2);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot === SHOT_START || shot === SHOT_PLAY || shot === SHOT_END) {
  runShot(shot);
} else {
  toTitle();
  announce('Azure Isles Sky Courier. Choose a mission to fly.');
  requestAnimationFrame(frame);
}
