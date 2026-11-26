// Every tuning number and colour in one place. The world is a 4200 x 4200 metre
// archipelago; the renderer draws it at whatever window the browser gives it,
// so no rule below depends on the screen size.

export const WORLD = {
  size: 4200,
  seaLevel: 0,
  maxAltitude: 900,
  fogNear: 900,
  fogFar: 3800,
};

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

export const PLANE = {
  // Arcade flight model: speed in m/s, angles in radians.
  minSpeed: 18, // below this the wing stops flying and the plane sinks
  maxSpeed: 95,
  cruiseSpeed: 55,
  accel: 26, // m/s^2 at full throttle
  drag: 0.12, // quadratic drag coefficient
  pitchRate: 0.9, // rad/s at full stick
  rollRate: 2.2, // rad/s at full stick
  turnRate: 0.55, // yaw rad/s at full bank
  autoLevel: 0.6, // how strongly the plane levels its wings hands-off
  sinkRate: 14, // m/s fallen when stalled
  climbFactor: 0.55, // fraction of speed turned into climb at full pull
  fuelCapacity: 100,
  fuelBurn: 1.55, // units/s at full throttle
  fuelBurnIdle: 0.35,
  ringFuel: 12, // fuel back per ring flown
  crashSpeed: 26, // vertical speed (m/s) above which a touchdown is a crash
  landSpeedMax: 34, // fastest ground speed that still counts as a landing
};

export const MISSIONS = {
  RING_RUN: { rings: 10, timeLimit: 300 },
  ISLAND_HOP: { stops: 3 },
  FREE_FLIGHT: { crates: 12 },
};

export const SCORE = {
  ring: 100,
  ringTimeBonus: 2, // per second left on the clock at the last ring
  landing: 250,
  landingSmooth: 150, // extra for a gentle touchdown
  crate: 75,
  perfectRing: 50, // through the centre third of the ring
};

export const PALETTE = {
  skyTop: 0x2f6fd0,
  skyBottom: 0xcfe8f7,
  sun: 0xfff2c0,
  sea: 0x1e6f8e,
  seaDeep: 0x14506b,
  sand: 0xe8d49a,
  grass: 0x5da24a,
  grassDry: 0x9db356,
  rock: 0x8a7f72,
  snow: 0xf2f4f6,
  runway: 0x3a3f46,
  runwayLine: 0xf5f5f0,
  planeBody: 0xe8542f,
  planeAccent: 0xffffff,
  planeWing: 0xf2f2ee,
  ring: 0xffc21c,
  ringNext: 0x2fd47c,
  crate: 0xff8c1a,
  cloud: 0xffffff,
  hudText: '#eef4f8',
  hudDim: '#a9c3d4',
  hudWarn: '#ffb02e',
  hudBad: '#ff5a4e',
  hudGood: '#54e08a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** localStorage key for the best score (this browser only). */
export const BEST_KEY = 'azure-isles-sky-courier.best';
