// config.js — §1 TUNING: every number that defines the game, in one place.
// Imports: none. Imported by helpers.js and scene.js.
// Dev note: ES modules do NOT work by double-clicking (file:// blocks
// imports). Run a local server from the docs/ folder, e.g.
// `python3 -m http.server` in docs/, or VSCode Live Server.
// GitHub Pages needs no build step — it serves these files as-is.

// ---------------------------------------------------------------------------
// 1. TUNING — change the game here, not scattered through the code.
// ---------------------------------------------------------------------------
export const CONFIG = {
  width: 960,
  height: 540,
  worldWidth: 2400,
  worldHeight: 1800,
  runLengthSec: 300,      // 5:00 — the boss spawns at this moment
  playerMaxHp: 100,
  playerSpeed: 220,       // px/s
  playerRadius: 16,
  invulnSec: 0.6,         // i-frames after a hit
  pickupRadius: 70,       // magnet radius for XP gems, at start
  spawnStartSec: 0.9,     // spawn interval at 0:00
  spawnEndSec: 0.35,      // spawn interval at 4:30 (and after)
  spawnEndAtSec: 270,     // 4:30 — interval stops shrinking here
  spawnBatchEverySec: 75, // +1 enemy per batch every 75s, max 4
  spawnMaxBatch: 4,
  swarmFirstSec: 30,      // first swarm ring at 0:30, then every 40s
  swarmEverySec: 40,
  swarmCount: 10,         // drones in each ring, closing in on the player
  hpScalePerMin: 0.35,    // enemy HP x (1 + elapsed/60 * 0.35)
  eliteFromSec: 120,      // elites appear from 2:00
  eliteChance: 0.10,      // 10% of spawns are elites after 2:00
  eliteHpMult: 3,
  eliteScale: 1.6,
  bossHp: 1200,
  bossSpeed: 60,
  bossContactDmg: 20,
  bossSpawnDroneEverySec: 6,
  bossBurstEverySec: 5,
  bossBurstCount: 8,      // 8-way bullet burst
  gemMagnetSpeed: 420,    // px/s a magnetised gem flies to the player
  gemCollectDist: 26,     // px — a gem this close is collected
  healthDropChance: 0.05, // ~5% of kills drop a Health Cell
  magnetDropChance: 0.03, // ~3% of kills drop a Magnet Cell
  healthCellHeal: 25,
  maxWeapons: 3,
  maxWeaponLevel: 5,
};

// Enemy types. unlockSec = when they start appearing.
// xp = the gem value they drop. Elite drops are overridden to 10.
export const ENEMY_TYPES = {
  drone:   { hp: 12, speed: 90, dmg: 8,  xp: 1, radius: 14, unlockSec: 0,  weight: 10 },
  crawler: { hp: 36, speed: 55, dmg: 12, xp: 3, radius: 20, unlockSec: 45, weight: 6 },
  spitter: { hp: 20, speed: 70, dmg: 10, xp: 3, radius: 15, unlockSec: 90, weight: 5,
             shootEverySec: 2.5, keepDist: 220, bulletSpeed: 200 },
};

// Weapon definitions. Level tables are in the pure helpers below,
// so the numbers here are only the level-1 starting values.
export const WEAPONS = {
  blaster: { name: "Pulse Blaster",  desc: "Auto-fires at the nearest enemy." },
  blades:  { name: "Orbital Blades", desc: "Energy blades orbit you and slice on contact." },
  nova:    { name: "Nova Pulse",     desc: "A radial burst that knocks enemies back." },
};
