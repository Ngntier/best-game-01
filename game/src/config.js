// VOIDBLOOM tuning: every number the game balances on lives here, so a tweak
// never means hunting through the simulation or the renderer.
export const STEP = 1 / 60;
export const BEST_KEY = 'voidbloom.best';

// The arena the ship flies in, in world units. The camera follows the ship.
export const ARENA = { width: 2600, height: 1800 };

// What the player starts with.
export const PLAYER = {
  radius: 16,
  speed: 250,
  maxHull: 100,
  fireInterval: 0.4,
  bulletSpeed: 620,
  bulletDamage: 15,
  bulletRadius: 5,
  magnetRadius: 90,
  pickupRadius: 24,
  invulnSeconds: 0.8,
  contactKnockback: 260,
};

// Experience: gems are worth 1 xp each; the bar grows a little every level.
export const XP_BASE = 6;
export const XP_PER_LEVEL = 4;

// The boss arrives at this time; killing it wins the game.
export const BOSS_TIME = 180;
export const BOSS = {
  radius: 64,
  maxHp: 2600,
  speed: 68,
  damage: 30,
  score: 1500,
  burstInterval: 2.6,
  burstCount: 12,
  orbSpeed: 210,
  orbRadius: 8,
  orbDamage: 12,
  minionInterval: 9,
};

// Enemy kinds. speed is world units per second, damage is hull lost on touch,
// score and gems are what the kill pays.
export const ENEMIES = {
  drifter: { hp: 22, speed: 92, radius: 17, damage: 10, score: 10, gems: 1, color: '#ff5d8f' },
  darter: { hp: 12, speed: 178, radius: 12, damage: 8, score: 15, gems: 1, color: '#ffb03a' },
  bulwark: { hp: 110, speed: 52, radius: 28, damage: 18, score: 30, gems: 3, color: '#b388ff' },
  splitter: { hp: 34, speed: 78, radius: 20, damage: 12, score: 25, gems: 2, color: '#3ae0b0' },
  mite: { hp: 8, speed: 205, radius: 9, damage: 6, score: 5, gems: 1, color: '#7de3ff' },
  spitter: { hp: 40, speed: 70, radius: 19, damage: 10, score: 35, gems: 2, color: '#d8ff3a' },
};

// How the pressure grows: spawn interval and batch size by elapsed seconds.
export const SPAWN_TABLE = [
  { until: 30, interval: 1.15, batch: 1 },
  { until: 60, interval: 0.95, batch: 2 },
  { until: 90, interval: 0.8, batch: 2 },
  { until: 120, interval: 0.65, batch: 3 },
  { until: 150, interval: 0.58, batch: 3 },
  { until: 180, interval: 0.52, batch: 3 },
  { until: Infinity, interval: 0.46, batch: 4 },
];

// Which kinds may spawn at each time, with weights. New kinds join as the
// clock runs, so the mix the player meets keeps changing.
export const SPAWN_MIX = [
  { until: 20, kinds: [['drifter', 1]] },
  { until: 45, kinds: [['drifter', 3], ['darter', 1]] },
  { until: 75, kinds: [['drifter', 3], ['darter', 2], ['splitter', 1]] },
  { until: 110, kinds: [['drifter', 3], ['darter', 2], ['splitter', 1], ['bulwark', 1]] },
  { until: 150, kinds: [['drifter', 2], ['darter', 2], ['splitter', 1], ['bulwark', 1], ['spitter', 1]] },
  { until: Infinity, kinds: [['drifter', 2], ['darter', 3], ['splitter', 2], ['bulwark', 2], ['spitter', 2]] },
];

// Spitters keep this distance and shoot orbs this often.
export const SPITTER = { range: 340, shootInterval: 2.4, orbSpeed: 230, orbRadius: 7, orbDamage: 9 };

// How far outside the camera new enemies appear.
export const SPAWN_MARGIN = 60;
// How far a gem flies when it pops out of a kill.
export const GEM_SCATTER = 90;

// Scoring extras.
export const LEVEL_BONUS = 50;
export const TIME_SCORE_PER_SECOND = 1;
