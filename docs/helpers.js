// helpers.js — §2 PURE HELPERS: XP curve, spawn math, weapon stats.
// No Phaser in here, so these are the easiest bits to unit-test.
// Imports: CONFIG, ENEMY_TYPES from './config.js'.
// Dev note: ES modules do NOT work by double-clicking (file:// blocks
// imports). Run a local server from the docs/ folder, e.g.
// `python3 -m http.server` in docs/, or VSCode Live Server.
// GitHub Pages needs no build step — it serves these files as-is.

import { CONFIG, ENEMY_TYPES } from './config.js';

// ---------------------------------------------------------------------------
// 2. PURE HELPERS — no Phaser, no side effects. Easy to test.
// ---------------------------------------------------------------------------
// XP to go from `level` to `level + 1`: 5, 9, 13, 17, 21, ...
export function xpForLevel(level) { return 5 + (level - 1) * 4; }

// Spawn interval shrinks linearly from 0.9s at 0:00 to 0.35s at 4:30,
// then stays at 0.35s. (elapsed is seconds since the run started.)
export function spawnIntervalSec(elapsed) {
  const t = Math.min(elapsed, CONFIG.spawnEndAtSec) / CONFIG.spawnEndAtSec;
  return Math.max(CONFIG.spawnEndSec,
    CONFIG.spawnStartSec - (CONFIG.spawnStartSec - CONFIG.spawnEndSec) * t);
}
// Batch size: 1 until 1:15, then 2, 3 from 2:30, 4 from 3:45.
export function spawnBatchSize(elapsed) {
  return Math.min(CONFIG.spawnMaxBatch,
    1 + Math.floor(elapsed / CONFIG.spawnBatchEverySec));
}
// Enemy HP multiplier: x1.00 at 0:00, x1.35 at 1:00, x2.05 at 3:00...
export function enemyHpScale(elapsed) {
  return 1 + (elapsed / 60) * CONFIG.hpScalePerMin;
}
// Which enemy types are unlocked at this moment in the run?
export function unlockedEnemyTypes(elapsed) {
  return Object.keys(ENEMY_TYPES).filter(function (k) {
    return elapsed >= ENEMY_TYPES[k].unlockSec;
  });
}
// Flat -1 damage per armour point, but a hit always deals at least 3.
export function damageAfterArmour(raw, armour) {
  return Math.max(3, raw - armour);
}

// --- Weapon stats by level (1..5). Each level adds something real. ---
// Blaster: damage up every level, faster fire, +1 projectile at 3 and 5.
export function blasterStats(level) {
  return {
    dmg: 10 + (level - 1) * 3,                 // 10, 13, 16, 19, 22
    intervalMs: 500 - (level - 1) * 50,        // 500 .. 300 ms (2 -> 3.3 shots/s)
    projectiles: 1 + Math.floor((level - 1) / 2), // 1, 1, 2, 2, 3
    bulletSpeed: 420,
  };
}
// Blades: damage up, +1 blade at 3 and 5, wider orbit, faster spin.
// Starts with 3 blades — the orbit has to be worth picking up
// before the player is surrounded.
export function bladeStats(level) {
  return {
    dmg: 14 + (level - 1) * 3,                 // 14, 17, 20, 23, 26
    count: 3 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0), // 3, 3, 4, 4, 5
    radius: 85 + (level - 1) * 8,              // 85 .. 117
    spinRadPerSec: 3.4 + (level - 1) * 0.3,    // 3.4 .. 4.6
  };
}
// Nova Pulse: damage up, wider radius, shorter cooldown.
export function novaStats(level) {
  return {
    dmg: 18 + (level - 1) * 4,                 // 18, 22, 26, 30, 34
    radius: 140 + (level - 1) * 20,            // 140 .. 220
    cooldownMs: 4000 - (level - 1) * 400,      // 4000 .. 2400 ms
    knockback: 260,                            // px/s shove away from the player
  };
}
export function weaponStats(id, level) {
  if (id === "blaster") return blasterStats(level);
  if (id === "blades") return bladeStats(level);
  return novaStats(level);
}

// Timer display: 87 seconds -> "1:27", 300 -> "5:00".
export function formatTime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
