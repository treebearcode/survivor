/* ============================================================================
   Starfall Survivor — V1
   A roguelike survivor game (Vampire Survivors-style), space / sci-fi
   with a fantasy wink: Nova the salvager fights scrap drones, void
   crawlers and spitters with a pulse blaster, orbiting energy blades
   and a nova pulse, and survives 5:00 to face the Void Dreadnought.

   All art and names are original, all graphics are procedural
   (drawn in code with Phaser Graphics), all sounds are WebAudio
   beeps — no external assets.

   HOW THIS FILE IS ORGANISED (a learning map — read top to bottom):
     1. TUNING — every number that defines the game, in one place.
     2. PURE HELPERS — XP curve, spawn math, weapon stats. No Phaser
        in here, so these are the easiest bits to unit-test (see the
        node check at the bottom: module.exports).
     3. SOUND — tiny WebAudio beeps, no audio files.
     4. TEXTURES — all art is drawn in code with Phaser Graphics.
     5. SurvivorScene — the one scene: create() builds the world,
        update() is the GAME LOOP (~60x/second) and drives movement,
        spawning, weapons, pickups, level-ups and the boss.
     6. BOOT — startSurvivor() creates the Phaser.Game. index.html
        calls it (and falls back to the CDN Phaser if the local copy
        failed to load).

   PITFALL AVOIDED (learned on the platformer): a lone staticImage
   is skipped by Phaser's overlap/collide processors, so anything
   that needs overlap/collision lives in a physics GROUP here —
   enemies, player bullets, enemy bullets, gems, pickups and blades
   are all groups, never lone static images.

   CONTROLS: WASD / arrows to move (hold the mouse to move toward
   the pointer instead). Weapons fire on their own — no aiming.
   1 / 2 / 3 or click a card to pick a level-up. P = pause.
   Enter / click to start, R to restart after game over / victory.
   ========================================================================== */

// ---------------------------------------------------------------------------
// 1. TUNING — change the game here, not scattered through the code.
// ---------------------------------------------------------------------------
const CONFIG = {
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
  spawnStartSec: 1.2,     // spawn interval at 0:00
  spawnEndSec: 0.35,      // spawn interval at 4:30 (and after)
  spawnEndAtSec: 270,     // 4:30 — interval stops shrinking here
  spawnBatchEverySec: 90, // +1 enemy per batch every 90s, max 4
  spawnMaxBatch: 4,
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
const ENEMY_TYPES = {
  drone:   { hp: 12, speed: 90, dmg: 8,  xp: 1, radius: 14, unlockSec: 0,  weight: 10 },
  crawler: { hp: 36, speed: 55, dmg: 12, xp: 3, radius: 20, unlockSec: 45, weight: 6 },
  spitter: { hp: 20, speed: 70, dmg: 10, xp: 3, radius: 15, unlockSec: 90, weight: 5,
             shootEverySec: 2.5, keepDist: 220, bulletSpeed: 200 },
};

// Weapon definitions. Level tables are in the pure helpers below,
// so the numbers here are only the level-1 starting values.
const WEAPONS = {
  blaster: { name: "Pulse Blaster",  desc: "Auto-fires at the nearest enemy." },
  blades:  { name: "Orbital Blades", desc: "Energy blades orbit you and slice on contact." },
  nova:    { name: "Nova Pulse",     desc: "A radial burst that knocks enemies back." },
};

// ---------------------------------------------------------------------------
// 2. PURE HELPERS — no Phaser, no side effects. Easy to test.
// ---------------------------------------------------------------------------
// XP to go from `level` to `level + 1`: 5, 9, 13, 17, 21, ...
function xpForLevel(level) { return 5 + (level - 1) * 4; }

// Spawn interval shrinks linearly from 1.2s at 0:00 to 0.35s at 4:30,
// then stays at 0.35s. (elapsed is seconds since the run started.)
function spawnIntervalSec(elapsed) {
  const t = Math.min(elapsed, CONFIG.spawnEndAtSec) / CONFIG.spawnEndAtSec;
  return Math.max(CONFIG.spawnEndSec,
    CONFIG.spawnStartSec - (CONFIG.spawnStartSec - CONFIG.spawnEndSec) * t);
}
// Batch size: 1 until 1:30, then 2, 3 from 3:00, 4 from 4:30.
function spawnBatchSize(elapsed) {
  return Math.min(CONFIG.spawnMaxBatch,
    1 + Math.floor(elapsed / CONFIG.spawnBatchEverySec));
}
// Enemy HP multiplier: x1.00 at 0:00, x1.35 at 1:00, x2.05 at 3:00...
function enemyHpScale(elapsed) {
  return 1 + (elapsed / 60) * CONFIG.hpScalePerMin;
}
// Which enemy types are unlocked at this moment in the run?
function unlockedEnemyTypes(elapsed) {
  return Object.keys(ENEMY_TYPES).filter(function (k) {
    return elapsed >= ENEMY_TYPES[k].unlockSec;
  });
}
// Flat -1 damage per armour point, but a hit always deals at least 3.
function damageAfterArmour(raw, armour) {
  return Math.max(3, raw - armour);
}

// --- Weapon stats by level (1..5). Each level adds something real. ---
// Blaster: damage up every level, faster fire, +1 projectile at 3 and 5.
function blasterStats(level) {
  return {
    dmg: 10 + (level - 1) * 3,                 // 10, 13, 16, 19, 22
    intervalMs: 500 - (level - 1) * 50,        // 500 .. 300 ms (2 -> 3.3 shots/s)
    projectiles: 1 + Math.floor((level - 1) / 2), // 1, 1, 2, 2, 3
    bulletSpeed: 420,
  };
}
// Blades: damage up, +1 blade at 3 and 5, wider orbit, faster spin.
function bladeStats(level) {
  return {
    dmg: 12 + (level - 1) * 3,                 // 12, 15, 18, 21, 24
    count: 2 + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0), // 2, 2, 3, 3, 4
    radius: 70 + (level - 1) * 8,              // 70 .. 102
    spinRadPerSec: 2.8 + (level - 1) * 0.3,    // 2.8 .. 4.0
  };
}
// Nova Pulse: damage up, wider radius, shorter cooldown.
function novaStats(level) {
  return {
    dmg: 18 + (level - 1) * 4,                 // 18, 22, 26, 30, 34
    radius: 140 + (level - 1) * 20,            // 140 .. 220
    cooldownMs: 4000 - (level - 1) * 400,      // 4000 .. 2400 ms
    knockback: 260,                            // px/s shove away from the player
  };
}
function weaponStats(id, level) {
  if (id === "blaster") return blasterStats(level);
  if (id === "blades") return bladeStats(level);
  return novaStats(level);
}

// Timer display: 87 seconds -> "1:27", 300 -> "5:00".
function formatTime(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// 3. SOUND — WebAudio beeps. No audio files, no Phaser sound manager.
//    Created lazily on first user click (browsers block audio before
//    the user interacts with the page).
// ---------------------------------------------------------------------------
let _audioCtx = null;
function beep(freq, durationMs, type, volume) {
  try {
    if (!_audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      _audioCtx = new AC();
    }
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.value = volume || 0.08;
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.start();
    osc.stop(_audioCtx.currentTime + (durationMs || 90) / 1000);
  } catch (e) { /* sound is cosmetic — never let it crash the game */ }
}
const sfx = {
  shoot:    function () { beep(720, 50, "square", 0.03); },
  hit:      function () { beep(200, 90, "sawtooth", 0.05); },
  hurt:     function () { beep(140, 160, "sawtooth", 0.06); },
  pickup:   function () { beep(880, 60, "sine", 0.07); setTimeout(function () { beep(1320, 80, "sine", 0.05); }, 60); },
  levelup:  function () { beep(523, 90, "triangle", 0.08); setTimeout(function () { beep(784, 120, "triangle", 0.08); }, 90); },
  nova:     function () { beep(330, 200, "sine", 0.07); },
  boss:     function () { beep(110, 300, "sawtooth", 0.08); setTimeout(function () { beep(165, 300, "sawtooth", 0.06); }, 200); },
  victory:  function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { beep(f, 140, "triangle", 0.08); }, i * 120); }); },
  gameover: function () { beep(220, 400, "sawtooth", 0.06); },
};

// ---------------------------------------------------------------------------
// 4. TEXTURES — procedural art. Each function draws once into a texture
//    that sprites then reuse (cheap: one draw, many sprites).
//    To swap in real sprite art later, drop PNGs in src/assets/ and
//    replace a make*Texture() call with this.load.image() in preload()
//    — the game code only ever refers to the texture keys.
// ---------------------------------------------------------------------------
function makePlayerTexture(scene) {
  const key = "player";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Salvager ship: a little arrow-shaped hull, cyan with a gold trim.
  // (The fantasy wink: the hull's gold trim is a rune ring.)
  g.fillStyle(0x2de2ff, 1);
  g.fillTriangle(18, 2, 34, 30, 18, 24);   // right wing
  g.fillTriangle(18, 2, 2, 30, 18, 24);    // left wing
  g.fillStyle(0x0e7fa8, 1);
  g.fillTriangle(18, 6, 26, 28, 18, 24);
  g.fillTriangle(18, 6, 10, 28, 18, 24);
  g.fillStyle(0xffd23f, 1);                // rune ring / cockpit
  g.fillCircle(18, 18, 5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(18, 18, 2.5);
  g.generateTexture(key, 36, 36);
  g.destroy();
  return key;
}
function makeDroneTexture(scene) {
  const key = "drone";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x8a94a6, 1);                 // scrap-grey hull
  g.fillPoints([{ x: 16, y: 2 }, { x: 30, y: 16 }, { x: 16, y: 30 }, { x: 2, y: 16 }], true);
  g.fillStyle(0xff6b35, 1);                 // rust-orange core
  g.fillCircle(16, 16, 6);
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(16, 16, 2.5);
  g.generateTexture(key, 32, 32);
  g.destroy();
  return key;
}
function makeCrawlerTexture(scene) {
  const key = "crawler";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x9b5de5, 1);                 // void-purple blob
  g.fillCircle(22, 22, 18);
  g.fillStyle(0x6d28a8, 1);
  g.fillCircle(14, 16, 7);
  g.fillCircle(30, 28, 6);
  g.fillStyle(0xf15bb5, 1);                 // pink eyes
  g.fillCircle(16, 20, 3);
  g.fillCircle(28, 20, 3);
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(16, 20, 1.5);
  g.fillCircle(28, 20, 1.5);
  g.generateTexture(key, 44, 44);
  g.destroy();
  return key;
}
function makeSpitterTexture(scene) {
  const key = "spitter";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x2ec4b6, 1);                 // teal diamond
  g.fillPoints([{ x: 17, y: 1 }, { x: 33, y: 17 }, { x: 17, y: 33 }, { x: 1, y: 17 }], true);
  g.fillStyle(0x0f766e, 1);
  g.fillCircle(17, 17, 8);
  g.fillStyle(0xffffff, 1);                 // one big eye — it aims
  g.fillCircle(17, 15, 4);
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(17, 15, 2);
  g.generateTexture(key, 34, 34);
  g.destroy();
  return key;
}
function makeBossTexture(scene) {
  const key = "boss";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Void Dreadnought: a big dark hull with gold plating and a red eye.
  g.fillStyle(0x3d0c3d, 1);
  g.fillPoints([{ x: 48, y: 2 }, { x: 90, y: 30 }, { x: 78, y: 88 }, { x: 48, y: 96 }, { x: 18, y: 88 }, { x: 6, y: 30 }], true);
  g.fillStyle(0xffd23f, 1);
  g.fillRect(40, 14, 16, 60);
  g.fillStyle(0x7a1f1f, 1);
  g.fillCircle(48, 44, 14);
  g.fillStyle(0xff2e63, 1);                 // the eye
  g.fillCircle(48, 44, 8);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(48, 44, 3);
  g.generateTexture(key, 96, 96);
  g.destroy();
  return key;
}
function makeGemTexture(scene, value) {
  const key = "gem-" + value;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // 1 XP = small cyan, 3 XP = green, 10 XP = big gold.
  const color = value >= 10 ? 0xffd23f : value >= 3 ? 0x4ade80 : 0x2de2ff;
  const s = value >= 10 ? 28 : value >= 3 ? 22 : 16;
  const c = s / 2;
  g.fillStyle(0xffffff, 1);
  g.fillPoints([{ x: c, y: 0 }, { x: s, y: c }, { x: c, y: s }, { x: 0, y: c }], true);
  g.fillStyle(color, 1);
  g.fillPoints([{ x: c, y: 3 }, { x: s - 3, y: c }, { x: c, y: s - 3 }, { x: 3, y: c }], true);
  g.generateTexture(key, s, s);
  g.destroy();
  return key;
}
function makeBulletTexture(scene, key, color) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 7);
  g.fillStyle(color, 1);
  g.fillCircle(8, 8, 5);
  g.generateTexture(key, 16, 16);
  g.destroy();
  return key;
}
function makeBladeTexture(scene) {
  const key = "blade";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Energy blade: a long cyan shard with a gold hilt dot.
  g.fillStyle(0x2de2ff, 1);
  g.fillPoints([{ x: 14, y: 0 }, { x: 22, y: 14 }, { x: 14, y: 34 }, { x: 6, y: 14 }], true);
  g.fillStyle(0xffd23f, 1);
  g.fillCircle(14, 28, 3);
  g.generateTexture(key, 28, 36);
  g.destroy();
  return key;
}
function makePickupTexture(scene, key, color, cross) {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(14, 14, 13);
  g.fillStyle(color, 1);
  g.fillCircle(14, 14, 11);
  g.fillStyle(0xffffff, 1);
  if (cross) { g.fillRect(12, 6, 4, 16); g.fillRect(6, 12, 16, 4); }
  else { g.fillRect(6, 6, 6, 16); g.fillRect(16, 6, 6, 10); } // magnet: a U
  g.generateTexture(key, 28, 28);
  g.destroy();
  return key;
}
function makeStarTexture(scene) {
  const key = "star";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(2, 2, 2);
  g.generateTexture(key, 4, 4);
  g.destroy();
  return key;
}
function makeNebulaTexture(scene) {
  const key = "nebula";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Soft blob: three concentric circles, fading alpha — reads as a
  // gas cloud once tinted and scaled up. No colliding obstacles:
  // nebulae are decoration only.
  g.fillStyle(0xffffff, 0.10); g.fillCircle(100, 100, 98);
  g.fillStyle(0xffffff, 0.14); g.fillCircle(100, 100, 66);
  g.fillStyle(0xffffff, 0.20); g.fillCircle(100, 100, 36);
  g.generateTexture(key, 200, 200);
  g.destroy();
  return key;
}
function makeRingTexture(scene) {
  const key = "ring";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.lineStyle(6, 0x2de2ff, 1);
  g.strokeCircle(64, 64, 58);
  g.generateTexture(key, 128, 128);
  g.destroy();
  return key;
}

// ---------------------------------------------------------------------------
// 5. SurvivorScene — the one scene. create() builds the world once;
//    update(time, delta) is the GAME LOOP, called ~60x/second.
//    All timers use `delta` (ms since last frame) so P-pause freezes
//    everything cleanly: when not playing, update() returns early
//    and no timer advances.
// ---------------------------------------------------------------------------
class SurvivorScene extends Phaser.Scene {
  constructor() {
    super("SurvivorScene");
    this.state = "title"; // title | playing | levelup | paused | gameover | victory
    this.elapsed = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.hp = CONFIG.playerMaxHp;
    this.maxHp = CONFIG.playerMaxHp;
    this.weapons = {};          // id -> level, e.g. { blaster: 1 }
    this.damageMult = 1;        // +20% per Damage upgrade
    this.speedMult = 1;         // +15% per Speed upgrade
    this.magnetMult = 1;        // +15% per Magnet upgrade
    this.armour = 0;            // -1 contact damage each, min 3 per hit
    this.invulnUntil = 0;
    this.spawnTimer = 0;
    this.blasterTimer = 0;
    this.novaTimer = 0;
    this.bladeAngle = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.bossDroneTimer = 0;
    this.bossBurstTimer = 0;
    this.levelUpQueue = 0;
    this.levelUpOptions = [];
    this.bestTime = 0;
    this.bestLevel = 0;
  }

  create() {
    // --- Textures (all procedural) ---
    makePlayerTexture(this);
    makeDroneTexture(this);
    makeCrawlerTexture(this);
    makeSpitterTexture(this);
    makeBossTexture(this);
    makeGemTexture(this, 1); makeGemTexture(this, 3); makeGemTexture(this, 10);
    makeBulletTexture(this, "bullet-player", 0x2de2ff);
    makeBulletTexture(this, "bullet-enemy", 0xff2e63);
    makeBladeTexture(this);
    makePickupTexture(this, "pickup-health", 0x4ade80, true);
    makePickupTexture(this, "pickup-magnet", 0x3b82f6, false);
    makeStarTexture(this);
    makeNebulaTexture(this);
    makeRingTexture(this);

    // --- World + camera ---
    this.physics.world.setBounds(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);
    this.cameras.main.setBounds(0, 0, CONFIG.worldWidth, CONFIG.worldHeight);
    this.add.rectangle(CONFIG.worldWidth / 2, CONFIG.worldHeight / 2,
      CONFIG.worldWidth, CONFIG.worldHeight, 0x050514).setDepth(-10);
    // World edge, so the player can tell where the map ends.
    const edge = this.add.graphics().setDepth(-9);
    edge.lineStyle(4, 0x2de2ff, 0.35);
    edge.strokeRect(2, 2, CONFIG.worldWidth - 4, CONFIG.worldHeight - 4);

    // Starfield + nebulae: decoration only, no collision.
    for (let i = 0; i < 14; i++) {
      const n = this.add.image(
        Phaser.Math.Between(0, CONFIG.worldWidth),
        Phaser.Math.Between(0, CONFIG.worldHeight), "nebula").setDepth(-8);
      n.setTint([0x7b2ff7, 0x2de2ff, 0xf15bb5, 0x4ade80][i % 4]);
      n.setScale(Phaser.Math.FloatBetween(2, 4.5));
      n.setAlpha(0.55);
    }
    for (let i = 0; i < 220; i++) {
      const s = this.add.image(
        Phaser.Math.Between(0, CONFIG.worldWidth),
        Phaser.Math.Between(0, CONFIG.worldHeight), "star").setDepth(-7);
      s.setScale(Phaser.Math.FloatBetween(0.5, 1.6));
      s.setAlpha(Phaser.Math.FloatBetween(0.3, 1));
    }

    // --- Player: Nova, the salvager ---
    this.player = this.physics.add.sprite(
      CONFIG.worldWidth / 2, CONFIG.worldHeight / 2, "player");
    this.player.setDepth(5);
    this.player.setCollideWorldBounds(true);
    this.player.body.setCircle(CONFIG.playerRadius, 2, 2);
    this.player.setData("radius", CONFIG.playerRadius);

    // --- Groups: EVERYTHING that collides/overlaps lives in a group.
    // (See the header note: a lone staticImage is skipped by the
    // overlap processors, so groups are not optional here.)
    this.enemies = this.physics.add.group();
    this.playerBullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.gems = this.physics.add.group();
    this.pickups = this.physics.add.group();
    this.blades = this.physics.add.group();

    // --- Overlaps (group vs group / group vs player) ---
    this.physics.add.overlap(this.playerBullets, this.enemies,
      (bullet, enemy) => this.onBulletHitEnemy(bullet, enemy));
    // NOTE: overlap callbacks receive (object1, object2) in the order
    // the objects were passed — enemies first here, so the first
    // argument IS the enemy. (Getting this backwards was a real bug
    // caught in review: the player would have been passed as "enemy".)
    this.physics.add.overlap(this.enemies, this.player,
      (enemy) => this.onEnemyTouchPlayer(enemy));
    this.physics.add.overlap(this.enemyBullets, this.player,
      (bullet) => this.onEnemyBulletHit(bullet));
    this.physics.add.overlap(this.blades, this.enemies,
      (blade, enemy) => this.onBladeHitEnemy(blade, enemy));
    this.physics.add.overlap(this.player, this.gems,
      (player, gem) => this.onGemCollect(gem));
    this.physics.add.overlap(this.player, this.pickups,
      (player, pickup) => this.onPickupCollect(pickup));

    // --- Input ---
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyP = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.keyR = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.keyEnter = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.key1 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
    this.key2 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
    this.key3 = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);

    // Best run, kept in localStorage (best time survived + best level).
    try {
      this.bestTime = Number(localStorage.getItem("starfall-best-time") || 0) || 0;
      this.bestLevel = Number(localStorage.getItem("starfall-best-level") || 0) || 0;
    } catch (e) { this.bestTime = 0; this.bestLevel = 0; }

    this.createHud();
    this.createOverlays();
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.physics.world.pause(); // title screen: nothing moves yet
    this.showTitle();
  }

  // --- HUD: HP bar, XP bar, timer, level, kills, weapon levels. ---
  // All HUD objects have scrollFactor 0, so they stay glued to the
  // camera while the world scrolls underneath.
  createHud() {
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(20);
    this.hpBarG = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.xpBarG = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.bossBarG = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.hudTimer = this.add.text(CONFIG.width / 2, 12, "0:00", {
      fontSize: "22px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20);
    this.hudLevel = this.add.text(16, 12, "Lv 1", {
      fontSize: "18px", color: "#ffffff", fontStyle: "bold",
    }).setScrollFactor(0).setDepth(20);
    this.hudKills = this.add.text(CONFIG.width - 16, 12, "Kills 0", {
      fontSize: "18px", color: "#ffffff",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(20);
    this.hudWeapons = this.add.text(16, 64, "", {
      fontSize: "14px", color: "#9beaff",
    }).setScrollFactor(0).setDepth(20);
    this.hudHint = this.add.text(CONFIG.width / 2, CONFIG.height - 24,
      "WASD / arrows or hold mouse to move  •  P pause", {
      fontSize: "13px", color: "#8fa8c8",
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(20);
    this.bossLabel = this.add.text(CONFIG.width / 2, 44, "VOID DREADNOUGHT", {
      fontSize: "15px", color: "#ff2e63", fontStyle: "bold",
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(20).setVisible(false);
  }

  drawHud() {
    // HP bar (top-left, under the level text).
    this.hpBarG.clear();
    this.hpBarG.fillStyle(0x000000, 0.55).fillRect(14, 38, 204, 16);
    const hpFrac = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBarG.fillStyle(hpFrac > 0.35 ? 0x4ade80 : 0xff2e63, 1)
      .fillRect(16, 40, 200 * hpFrac, 12);
    // XP bar (full width, just under the top edge).
    this.xpBarG.clear();
    this.xpBarG.fillStyle(0x000000, 0.55).fillRect(0, 0, CONFIG.width, 6);
    const xpFrac = Phaser.Math.Clamp(this.xp / this.xpNext, 0, 1);
    this.xpBarG.fillStyle(0x2de2ff, 1).fillRect(0, 0, CONFIG.width * xpFrac, 6);
    this.hudTimer.setText(formatTime(this.elapsed));
    this.hudLevel.setText("Lv " + this.level);
    this.hudKills.setText("Kills " + this.kills);
    const parts = Object.keys(this.weapons).map((id) =>
      WEAPONS[id].name + " " + this.weapons[id]);
    this.hudWeapons.setText(parts.join("   •   "));
    // Boss bar (only while the boss is alive).
    this.bossBarG.clear();
    if (this.boss && this.boss.active) {
      this.bossLabel.setVisible(true);
      const f = Phaser.Math.Clamp(this.boss.hp / this.boss.maxHp, 0, 1);
      this.bossBarG.fillStyle(0x000000, 0.55).fillRect(CONFIG.width / 2 - 202, 64, 404, 12);
      this.bossBarG.fillStyle(0xff2e63, 1).fillRect(CONFIG.width / 2 - 200, 66, 400 * f, 8);
    } else {
      this.bossLabel.setVisible(false);
    }
  }

  // --- Overlays: title / level-up / pause / game over / victory. ---
  // Each is a container, hidden until needed. Buttons are Phaser
  // containers with setInteractive, so clicks work on desktop and
  // touch alike. Keyboard shortcuts are handled in update().
  createOverlays() {
    // Title.
    this.titleBox = this.add.container(CONFIG.width / 2, CONFIG.height / 2)
      .setScrollFactor(0).setDepth(30);
    const titleBg = this.add.rectangle(0, 0, 620, 380, 0x050514, 0.88)
      .setStrokeStyle(2, 0x2de2ff, 0.8);
    this.titleBest = this.add.text(0, 128, "", {
      fontSize: "15px", color: "#9beaff", align: "center",
    }).setOrigin(0.5, 0);
    this.titleBox.add([
      titleBg,
      this.add.text(0, -160, "STARFALL SURVIVOR", {
        fontSize: "40px", color: "#2de2ff", fontStyle: "bold",
      }).setOrigin(0.5, 0),
      this.add.text(0, -108, "Nova the salvager vs. the void", {
        fontSize: "17px", color: "#eaf6ff",
      }).setOrigin(0.5, 0),
      this.add.text(0, -60,
        "Survive 5:00. Grab XP gems, level up,\nand defeat the Void Dreadnought.", {
        fontSize: "16px", color: "#c8d8ea", align: "center", lineSpacing: 6,
      }).setOrigin(0.5, 0),
      this.add.text(0, 20,
        "Move: WASD / arrows, or hold the mouse\nWeapons fire on their own — no aiming\n1 / 2 / 3 or click to pick a level-up card  •  P pause", {
        fontSize: "15px", color: "#8fa8c8", align: "center", lineSpacing: 6,
      }).setOrigin(0.5, 0),
      this.add.text(0, 96, "Click or press Enter to start", {
        fontSize: "18px", color: "#ffd23f", fontStyle: "bold",
      }).setOrigin(0.5, 0),
      this.titleBest,
    ]);

    // Level-up cards (built fresh each time in showLevelUp()).
    this.levelUpBox = this.add.container(0, 0).setScrollFactor(0).setDepth(30)
      .setVisible(false);

    // Pause.
    this.pauseBox = this.add.container(CONFIG.width / 2, CONFIG.height / 2)
      .setScrollFactor(0).setDepth(30).setVisible(false);
    this.pauseBox.add([
      this.add.rectangle(0, 0, 360, 140, 0x050514, 0.88)
        .setStrokeStyle(2, 0x2de2ff, 0.8),
      this.add.text(0, -40, "PAUSED", {
        fontSize: "32px", color: "#ffffff", fontStyle: "bold",
      }).setOrigin(0.5, 0),
      this.add.text(0, 10, "Press P to resume", {
        fontSize: "16px", color: "#9beaff",
      }).setOrigin(0.5, 0),
    ]);

    // Game over / victory share one box; setEndScreen() fills it in.
    this.endBox = this.add.container(CONFIG.width / 2, CONFIG.height / 2)
      .setScrollFactor(0).setDepth(30).setVisible(false);
    this.endTitle = this.add.text(0, -90, "", {
      fontSize: "36px", color: "#ff2e63", fontStyle: "bold",
    }).setOrigin(0.5, 0);
    this.endStats = this.add.text(0, -30, "", {
      fontSize: "17px", color: "#eaf6ff", align: "center", lineSpacing: 8,
    }).setOrigin(0.5, 0);
    this.endBest = this.add.text(0, 60, "", {
      fontSize: "15px", color: "#9beaff", align: "center",
    }).setOrigin(0.5, 0);
    this.endBox.add([
      this.add.rectangle(0, 0, 560, 300, 0x050514, 0.92)
        .setStrokeStyle(2, 0x2de2ff, 0.8),
      this.endTitle, this.endStats, this.endBest,
      this.add.text(0, 100, "Press R or click to play again", {
        fontSize: "16px", color: "#ffd23f",
      }).setOrigin(0.5, 0),
    ]);

    // Scene-level clicks: start from the title, restart from an end
    // screen. Level-up cards have their own handlers and this one
    // ignores the "levelup" state, so one click can never do two things.
    this.input.on("pointerdown", () => {
      if (this.state === "title") this.startRun();
      else if (this.state === "gameover" || this.state === "victory") this.restartRun();
    });
  }

  showTitle() {
    this.state = "title";
    this.titleBest.setText(this.bestTime > 0
      ? "Best: " + formatTime(this.bestTime) + "  •  Lv " + this.bestLevel
      : "No runs yet — good hunting, salvager.");
    this.titleBox.setVisible(true);
    this.drawHud();
  }

  startRun() {
    this.titleBox.setVisible(false);
    // Starting weapon: the Pulse Blaster, Lv 1. Every other weapon
    // comes from level-up cards (max 3 owned).
    this.weapons = { blaster: 1 };
    this.state = "playing";
    this.physics.world.resume();
    this.drawHud();
    sfx.pickup();
  }

  restartRun() {
    // Cleanest restart: rebuild the whole scene from scratch.
    this.scene.restart();
  }

  setEndScreen(isVictory) {
    this.saveBest();
    this.endTitle.setText(isVictory ? "VICTORY!" : "GAME OVER");
    this.endTitle.setColor(isVictory ? "#4ade80" : "#ff2e63");
    this.endStats.setText(
      "Survived " + formatTime(this.elapsed) +
      "  •  Level " + this.level + "  •  " + this.kills + " kills" +
      (isVictory ? "\nThe Void Dreadnought is scrap. The belt is yours." : ""));
    this.endBest.setText("Best: " + formatTime(this.bestTime) +
      "  •  Lv " + this.bestLevel);
    this.endBox.setVisible(true);
  }

  saveBest() {
    this.bestTime = Math.max(this.bestTime, Math.floor(this.elapsed));
    this.bestLevel = Math.max(this.bestLevel, this.level);
    try {
      localStorage.setItem("starfall-best-time", String(this.bestTime));
      localStorage.setItem("starfall-best-level", String(this.bestLevel));
    } catch (e) { /* localStorage may be unavailable — bests just don't persist */ }
  }

  // --- GAME LOOP ---
  update(time, delta) {
    // Keyboard shortcuts that work outside "playing".
    if (this.state === "title") {
      if (Phaser.Input.Keyboard.JustDown(this.keyEnter)) this.startRun();
      return;
    }
    if (this.state === "gameover" || this.state === "victory") {
      if (Phaser.Input.Keyboard.JustDown(this.keyR) ||
          Phaser.Input.Keyboard.JustDown(this.keyEnter)) this.restartRun();
      return;
    }
    if (this.state === "levelup") {
      if (Phaser.Input.Keyboard.JustDown(this.key1)) this.pickLevelUp(0);
      else if (Phaser.Input.Keyboard.JustDown(this.key2)) this.pickLevelUp(1);
      else if (Phaser.Input.Keyboard.JustDown(this.key3)) this.pickLevelUp(2);
      return;
    }
    if (this.state === "paused") {
      if (Phaser.Input.Keyboard.JustDown(this.keyP)) {
        this.state = "playing";
        this.pauseBox.setVisible(false);
        this.physics.world.resume();
      }
      return;
    }
    if (this.state !== "playing") return;

    if (Phaser.Input.Keyboard.JustDown(this.keyP)) {
      this.state = "paused";
      this.pauseBox.setVisible(true);
      this.physics.world.pause();
      return;
    }

    const dt = delta / 1000;
    this.elapsed += dt;

    this.movePlayer(dt);
    this.updateEnemies(time, dt);
    this.updateWeapons(time, dt);
    this.updateGems(dt);
    this.updateBullets(dt);

    // Spawning: interval shrinks, batch grows (pure helpers, §2).
    this.spawnTimer += dt;
    const interval = spawnIntervalSec(this.elapsed);
    if (this.spawnTimer >= interval) {
      this.spawnTimer = 0;
      const batch = spawnBatchSize(this.elapsed);
      for (let i = 0; i < batch; i++) this.spawnEnemy();
    }

    // Boss at 5:00 — once.
    if (this.elapsed >= CONFIG.runLengthSec && !this.bossSpawned) {
      this.spawnBoss();
    }

    this.drawHud();
  }

  movePlayer(dt) {
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.keyA.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.keyD.isDown) vx += 1;
    if (this.cursors.up.isDown || this.keyW.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.keyS.isDown) vy += 1;
    if (vx === 0 && vy === 0 && this.input.activePointer.isDown) {
      // Hold the mouse: move toward the pointer (world coordinates,
      // because the camera follows the player).
      const p = this.input.activePointer;
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const dx = wp.x - this.player.x, dy = wp.y - this.player.y;
      const d = Math.hypot(dx, dy);
      if (d > 10) { vx = dx / d; vy = dy / d; }
    }
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      vx /= len; vy /= len;
      const speed = CONFIG.playerSpeed * this.speedMult;
      this.player.setVelocity(vx * speed, vy * speed);
      // The ship texture points up, so rotate it to face movement.
      this.player.setRotation(Math.atan2(vy, vx) + Math.PI / 2);
    } else {
      this.player.setVelocity(0, 0);
    }
  }

  // --- Spawning ---
  spawnEnemyAt(x, y, typeId, forceElite) {
    const def = ENEMY_TYPES[typeId];
    const tex = typeId === "drone" ? "drone" : typeId === "crawler" ? "crawler" : "spitter";
    const isElite = !!forceElite ||
      (this.elapsed >= CONFIG.eliteFromSec && Math.random() < CONFIG.eliteChance);
    const e = this.enemies.create(x, y, tex);
    e.setDepth(4);
    e.eType = typeId;
    e.isBoss = false;
    e.isElite = isElite;
    e.hp = def.hp * enemyHpScale(this.elapsed) * (isElite ? CONFIG.eliteHpMult : 1);
    e.maxHp = e.hp;
    e.dmg = def.dmg;
    e.speed = def.speed;
    e.xpValue = isElite ? 10 : def.xp;
    e.shootTimer = Phaser.Math.FloatBetween(0, 1);
    e.lastBladeHit = 0;
    e.knockT = 0; e.knockVX = 0; e.knockVY = 0;
    e.body.setCircle(def.radius, (e.width - def.radius * 2) / 2, (e.height - def.radius * 2) / 2);
    if (isElite) { e.setScale(CONFIG.eliteScale); e.setTint(0xffd23f); }
    return e;
  }

  spawnEnemy() {
    // Pick a type, weighted, from the types unlocked so far.
    const unlocked = unlockedEnemyTypes(this.elapsed);
    let total = 0;
    unlocked.forEach((k) => { total += ENEMY_TYPES[k].weight; });
    let roll = Math.random() * total, typeId = unlocked[0];
    for (const k of unlocked) {
      roll -= ENEMY_TYPES[k].weight;
      if (roll <= 0) { typeId = k; break; }
    }
    // Off-screen ring around the player (viewport diagonal is ~555px,
    // so 620px out is safely off-screen), clamped to the world.
    const angle = Math.random() * Math.PI * 2;
    const dist = 620 + Math.random() * 120;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 20, CONFIG.worldWidth - 20);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 20, CONFIG.worldHeight - 20);
    this.spawnEnemyAt(x, y, typeId, false);
  }

  spawnBoss() {
    this.bossSpawned = true;
    const angle = Math.random() * Math.PI * 2;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * 450, 80, CONFIG.worldWidth - 80);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * 450, 80, CONFIG.worldHeight - 80);
    const b = this.enemies.create(x, y, "boss");
    b.setDepth(6);
    b.eType = "boss";
    b.isBoss = true;
    b.isElite = false;
    b.hp = CONFIG.bossHp;
    b.maxHp = CONFIG.bossHp;
    b.dmg = CONFIG.bossContactDmg;
    b.speed = CONFIG.bossSpeed;
    b.xpValue = 0;
    b.shootTimer = 0;
    b.lastBladeHit = 0;
    b.knockT = 0; b.knockVX = 0; b.knockVY = 0;
    b.body.setCircle(40, 8, 8);
    this.boss = b;
    this.bossDroneTimer = 0;
    this.bossBurstTimer = 0;
    sfx.boss();
  }

  // --- Enemy steering + spitter / boss attacks ---
  updateEnemies(time, dt) {
    const px = this.player.x, py = this.player.y;
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      const dx = px - e.x, dy = py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist, ny = dy / dist;
      let vx = 0, vy = 0;

      if (e.isBoss) {
        vx = nx * e.speed; vy = ny * e.speed;
        // Spawns a Scrap Drone every 6s, near itself.
        this.bossDroneTimer += dt;
        if (this.bossDroneTimer >= CONFIG.bossSpawnDroneEverySec) {
          this.bossDroneTimer = 0;
          this.spawnEnemyAt(
            Phaser.Math.Clamp(e.x + Phaser.Math.Between(-70, 70), 20, CONFIG.worldWidth - 20),
            Phaser.Math.Clamp(e.y + Phaser.Math.Between(-70, 70), 20, CONFIG.worldHeight - 20),
            "drone", false);
        }
        // 8-way bullet burst every 5s.
        this.bossBurstTimer += dt;
        if (this.bossBurstTimer >= CONFIG.bossBurstEverySec) {
          this.bossBurstTimer = 0;
          for (let i = 0; i < CONFIG.bossBurstCount; i++) {
            const a = (i / CONFIG.bossBurstCount) * Math.PI * 2;
            this.fireEnemyBullet(e.x, e.y, Math.cos(a), Math.sin(a), 180, 12);
          }
          sfx.shoot();
        }
      } else if (e.eType === "spitter") {
        // Keeps ~220px away: approach if far, back off if close.
        if (dist > 260) { vx = nx * e.speed; vy = ny * e.speed; }
        else if (dist < 180) { vx = -nx * e.speed; vy = -ny * e.speed; }
        e.shootTimer += dt;
        if (e.shootTimer >= ENEMY_TYPES.spitter.shootEverySec && dist < 520) {
          e.shootTimer = 0;
          this.fireEnemyBullet(e.x, e.y, nx, ny,
            ENEMY_TYPES.spitter.bulletSpeed, e.dmg);
        }
      } else {
        // Drone / crawler: straight at the player.
        vx = nx * e.speed; vy = ny * e.speed;
      }

      // Nova-pulse knockback decays over ~0.25s on top of steering.
      if (e.knockT > 0) {
        vx += e.knockVX; vy += e.knockVY;
        e.knockT -= dt;
        e.knockVX *= 0.88; e.knockVY *= 0.88;
      }
      e.setVelocity(vx, vy);
    });
  }

  fireEnemyBullet(x, y, nx, ny, speed, dmg) {
    const b = this.enemyBullets.create(x, y, "bullet-enemy");
    b.setDepth(3);
    b.dmg = dmg;
    b.life = 3000;
    b.body.setCircle(6, 2, 2);
    b.setVelocity(nx * speed, ny * speed);
  }

  // --- Weapons (all automatic) ---
  updateWeapons(time, dt) {
    // Pulse Blaster: fires at the nearest enemy.
    if (this.weapons.blaster) {
      this.blasterTimer += dt * 1000;
      const st = blasterStats(this.weapons.blaster);
      if (this.blasterTimer >= st.intervalMs) {
        this.blasterTimer = 0;
        const target = this.nearestEnemy(700);
        if (target) {
          const baseA = Math.atan2(target.y - this.player.y, target.x - this.player.x);
          for (let i = 0; i < st.projectiles; i++) {
            // Spread extra projectiles slightly around the aim angle.
            const a = baseA + (i - (st.projectiles - 1) / 2) * 0.14;
            const b = this.playerBullets.create(this.player.x, this.player.y, "bullet-player");
            b.setDepth(3);
            b.dmg = st.dmg;
            b.life = 1200;
            b.body.setCircle(6, 2, 2);
            b.setVelocity(Math.cos(a) * st.bulletSpeed, Math.sin(a) * st.bulletSpeed);
            b.setRotation(a);
          }
          sfx.shoot();
        }
      }
    }

    // Orbital Blades: keep the right number of blades and orbit them.
    if (this.weapons.blades) {
      const st = bladeStats(this.weapons.blades);
      this.ensureBladeCount(st.count);
      this.bladeAngle += st.spinRadPerSec * dt;
      const blades = this.blades.getChildren();
      for (let i = 0; i < blades.length; i++) {
        const a = this.bladeAngle + (i / blades.length) * Math.PI * 2;
        const bx = this.player.x + Math.cos(a) * st.radius;
        const by = this.player.y + Math.sin(a) * st.radius;
        const blade = blades[i];
        blade.setRotation(a + Math.PI / 2);
        // body.reset() moves the physics body with the sprite — the
        // blade has no velocity of its own, it is placed each frame.
        blade.body.reset(bx, by);
      }
    }

    // Nova Pulse: radial burst on a cooldown.
    if (this.weapons.nova) {
      this.novaTimer += dt * 1000;
      const st = novaStats(this.weapons.nova);
      if (this.novaTimer >= st.cooldownMs) {
        this.novaTimer = 0;
        this.fireNovaPulse(st);
      }
    }
  }

  ensureBladeCount(count) {
    // Re-read the group length each time: getChildren() may return a
    // live list, so never push into it by hand (that would duplicate
    // entries) — create() already adds the sprite to the group.
    while (this.blades.getChildren().length < count) {
      const b = this.blades.create(this.player.x, this.player.y, "blade");
      b.setDepth(6);
      b.setImmovable(true);
      b.body.setCircle(14, 0, 4);
    }
    while (this.blades.getChildren().length > count) {
      this.blades.getChildren()[this.blades.getChildren().length - 1].destroy();
    }
  }

  fireNovaPulse(st) {
    sfx.nova();
    // Expanding ring visual (a "ring" texture scaled up, then faded).
    const ring = this.add.image(this.player.x, this.player.y, "ring").setDepth(7);
    ring.setScale(0.3);
    this.tweens.add({
      targets: ring, scale: st.radius / 64, alpha: 0,
      duration: 350, onComplete: () => ring.destroy(),
    });
    // Damage + knockback everything inside the radius, right now.
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist <= st.radius + 20) {
        e.knockVX = (dx / dist) * st.knockback;
        e.knockVY = (dy / dist) * st.knockback;
        e.knockT = 0.25;
        this.damageEnemy(e, st.dmg);
      }
    });
  }

  nearestEnemy(maxDist) {
    let best = null, bestD = maxDist * maxDist;
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      const dx = e.x - this.player.x, dy = e.y - this.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    });
    return best;
  }

  // --- Damage / death ---
  // All weapon damage goes through here, so the +20% Damage upgrade
  // (this.damageMult) applies to every weapon exactly once.
  damageEnemy(enemy, rawDmg) {
    if (!enemy.active) return;
    enemy.hp -= rawDmg * this.damageMult;
    // Flash white for a frame; elites go back to gold afterwards.
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!enemy.active) return;
      if (enemy.isElite) enemy.setTint(0xffd23f);
      else enemy.clearTint();
    });
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    if (enemy.isBoss) {
      this.boss = null;
      enemy.destroy();
      this.winRun();
      return;
    }
    this.kills++;
    const x = enemy.x, y = enemy.y;
    // XP gem: elites drop a 10, everyone else their type value.
    const gem = this.gems.create(x, y, "gem-" + enemy.xpValue);
    gem.setDepth(2);
    gem.xpValue = enemy.xpValue;
    gem.magnetized = false;
    gem.body.setCircle(8, 0, 0);
    // Pickup drops: ~5% Health Cell, ~3% Magnet Cell (separate rolls).
    const r = Math.random();
    if (r < CONFIG.healthDropChance) this.dropPickup(x, y, "health");
    else if (r < CONFIG.healthDropChance + CONFIG.magnetDropChance) this.dropPickup(x, y, "magnet");
    enemy.destroy();
  }

  dropPickup(x, y, kind) {
    const p = this.pickups.create(x, y, kind === "health" ? "pickup-health" : "pickup-magnet");
    p.setDepth(2);
    p.kind = kind;
    p.body.setCircle(12, 2, 2);
  }

  hurtPlayer(rawDmg, time) {
    if (time < this.invulnUntil || this.state !== "playing") return;
    const dmg = damageAfterArmour(rawDmg, this.armour);
    this.hp -= dmg;
    this.invulnUntil = time + CONFIG.invulnSec * 1000;
    sfx.hurt();
    this.player.setTintFill(0xff0000);
    this.time.delayedCall(150, () => { if (this.player.active) this.player.clearTint(); });
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  die() {
    this.state = "gameover";
    this.physics.world.pause();
    sfx.gameover();
    this.setEndScreen(false);
  }

  winRun() {
    this.state = "victory";
    this.physics.world.pause();
    sfx.victory();
    this.setEndScreen(true);
  }

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const dmg = bullet.dmg;
    bullet.destroy();
    this.damageEnemy(enemy, dmg);
  }

  onBladeHitEnemy(blade, enemy) {
    if (!enemy.active || !this.weapons.blades) return;
    // One hit per enemy per 350ms — without this, a blade sitting on
    // an enemy would damage it every single frame.
    const now = this.time.now;
    if (now - enemy.lastBladeHit < 350) return;
    enemy.lastBladeHit = now;
    this.damageEnemy(enemy, bladeStats(this.weapons.blades).dmg);
  }

  onEnemyTouchPlayer(enemy) {
    if (!enemy.active) return;
    this.hurtPlayer(enemy.dmg, this.time.now);
  }

  onEnemyBulletHit(bullet) {
    if (!bullet.active) return;
    const dmg = bullet.dmg;
    bullet.destroy();
    this.hurtPlayer(dmg, this.time.now);
  }

  onGemCollect(gem) {
    if (!gem.active) return;
    const v = gem.xpValue || 1;
    gem.destroy();
    sfx.pickup();
    this.gainXp(v);
  }

  onPickupCollect(pickup) {
    if (!pickup.active) return;
    if (pickup.kind === "health") {
      this.hp = Math.min(this.maxHp, this.hp + CONFIG.healthCellHeal);
      sfx.pickup();
    } else {
      // Magnet Cell: every gem on the map flies to the player.
      this.gems.getChildren().forEach((g) => { if (g.active) g.magnetized = true; });
      sfx.levelup();
    }
    pickup.destroy();
  }

  // --- Gems: magnet movement (collection itself is the overlap) ---
  updateGems(dt) {
    const range = CONFIG.pickupRadius * this.magnetMult;
    this.gems.getChildren().forEach((g) => {
      if (!g.active) return;
      const dx = this.player.x - g.x, dy = this.player.y - g.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (g.magnetized || dist < range) {
        g.setVelocity((dx / dist) * CONFIG.gemMagnetSpeed, (dy / dist) * CONFIG.gemMagnetSpeed);
      } else {
        g.setVelocity(0, 0);
      }
    });
  }

  updateBullets(dt) {
    // Bullets die on a timer (player bullets ~1.2s, enemy bullets ~3s),
    // so a missed shot never flies across the whole map.
    [this.playerBullets, this.enemyBullets].forEach((group) => {
      group.getChildren().forEach((b) => {
        if (!b.active) return;
        b.life -= dt * 1000;
        if (b.life <= 0) b.destroy();
      });
    });
  }

  // --- XP + level-ups ---
  gainXp(amount) {
    this.xp += amount;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level++;
      this.xpNext = xpForLevel(this.level);
      this.levelUpQueue++;
    }
    if (this.levelUpQueue > 0 && this.state === "playing") this.showLevelUp();
  }

  buildLevelUpOptions() {
    const out = [];
    const owned = Object.keys(this.weapons);
    // New weapons (only while a slot is free — max 3 owned).
    if (owned.length < CONFIG.maxWeapons) {
      Object.keys(WEAPONS).forEach((id) => {
        if (!this.weapons[id]) {
          out.push({
            kind: "new", weapon: id,
            title: "NEW: " + WEAPONS[id].name,
            desc: WEAPONS[id].desc + " (Lv 1)",
          });
        }
      });
    }
    // Level up an owned weapon (never a maxed one).
    owned.forEach((id) => {
      const lvl = this.weapons[id];
      if (lvl < CONFIG.maxWeaponLevel) {
        out.push({
          kind: "upgrade", weapon: id,
          title: WEAPONS[id].name + "  Lv " + (lvl + 1),
          desc: this.describeWeapon(id, lvl + 1),
        });
      }
    });
    // Stat upgrades — always available, so there are always 3 cards.
    out.push(
      { kind: "stat", stat: "heal", title: "+20 Max HP", desc: "Raise max HP by 20 and heal 20 right now." },
      { kind: "stat", stat: "speed", title: "+15% Move Speed", desc: "Nova moves 15% faster. Stacks." },
      { kind: "stat", stat: "damage", title: "+20% Damage", desc: "All weapons deal 20% more damage. Stacks." },
      { kind: "stat", stat: "magnet", title: "+15% Magnet", desc: "XP gems fly to you from 15% further away. Stacks." },
      { kind: "stat", stat: "armour", title: "+1 Armour", desc: "Contact hits deal 1 less damage (never below 3). Stacks." },
    );
    // Shuffle and take 3 distinct options.
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.slice(0, 3);
  }

  describeWeapon(id, level) {
    if (id === "blaster") {
      const s = blasterStats(level);
      return "Damage " + s.dmg + ", " + s.projectiles + " projectile" +
        (s.projectiles > 1 ? "s" : "") + ", " +
        (1000 / s.intervalMs).toFixed(1) + " shots/s.";
    }
    if (id === "blades") {
      const s = bladeStats(level);
      return s.count + " blades, orbit radius " + s.radius + ", damage " + s.dmg + ".";
    }
    const s = novaStats(level);
    return "Damage " + s.dmg + ", radius " + s.radius +
      ", every " + (s.cooldownMs / 1000).toFixed(1) + "s.";
  }

  showLevelUp() {
    this.state = "levelup";
    this.physics.world.pause();
    sfx.levelup();
    this.levelUpOptions = this.buildLevelUpOptions();
    this.levelUpBox.removeAll(true);
    this.levelUpBox.add(this.add.text(CONFIG.width / 2, 92, "LEVEL UP!  Choose one:", {
      fontSize: "28px", color: "#ffd23f", fontStyle: "bold",
    }).setOrigin(0.5, 0));
    this.levelUpOptions.forEach((opt, i) => {
      const cx = 200 + i * 280, cy = 280;
      const card = this.add.container(cx, cy);
      card.setSize(240, 190);
      card.setInteractive({ useHandCursor: true });
      card.on("pointerdown", () => this.pickLevelUp(i));
      card.add([
        this.add.rectangle(0, 0, 240, 190, 0x0a1a3a, 0.95)
          .setStrokeStyle(2, 0x2de2ff, 0.9),
        this.add.text(0, -72, opt.title, {
          fontSize: "17px", color: "#ffffff", fontStyle: "bold",
          wordWrap: { width: 210 }, align: "center",
        }).setOrigin(0.5, 0),
        this.add.text(0, -18, opt.desc, {
          fontSize: "14px", color: "#c8d8ea",
          wordWrap: { width: 210 }, align: "center", lineSpacing: 5,
        }).setOrigin(0.5, 0),
        this.add.text(0, 68, "Press " + (i + 1) + " or click", {
          fontSize: "13px", color: "#ffd23f",
        }).setOrigin(0.5, 0),
      ]);
      this.levelUpBox.add(card);
    });
    this.levelUpBox.setVisible(true);
  }

  pickLevelUp(index) {
    if (this.state !== "levelup") return;
    const opt = this.levelUpOptions[index];
    if (!opt) return;
    if (opt.kind === "new") {
      this.weapons[opt.weapon] = 1;
      if (opt.weapon === "blades") this.ensureBladeCount(bladeStats(1).count);
      if (opt.weapon === "nova") this.novaTimer = 0;
    } else if (opt.kind === "upgrade") {
      this.weapons[opt.weapon]++;
      if (opt.weapon === "blades") this.ensureBladeCount(bladeStats(this.weapons.blades).count);
    } else if (opt.kind === "stat") {
      if (opt.stat === "heal") {
        this.maxHp += 20;
        this.hp = Math.min(this.maxHp, this.hp + 20);
      } else if (opt.stat === "speed") this.speedMult *= 1.15;
      else if (opt.stat === "damage") this.damageMult *= 1.20;
      else if (opt.stat === "magnet") this.magnetMult *= 1.15;
      else if (opt.stat === "armour") this.armour += 1;
    }
    this.levelUpBox.setVisible(false);
    this.levelUpQueue--;
    this.drawHud();
    if (this.levelUpQueue > 0) this.showLevelUp();
    else {
      this.state = "playing";
      this.physics.world.resume();
    }
  }
}

// ---------------------------------------------------------------------------
// 6. BOOT — index.html calls this once Phaser is loaded.
//    Returns false if Phaser isn't there (so the boot guard can show
//    the "couldn't start" message instead of crashing).
// ---------------------------------------------------------------------------
function startSurvivor() {
  if (typeof Phaser === "undefined") return false;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: CONFIG.width,
    height: CONFIG.height,
    backgroundColor: "#050514",
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: SurvivorScene,
  });
  return !!game;
}

if (typeof window !== "undefined") window.__startSurvivor = startSurvivor;
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CONFIG, ENEMY_TYPES, WEAPONS,
    xpForLevel, spawnIntervalSec, spawnBatchSize, enemyHpScale,
    unlockedEnemyTypes, damageAfterArmour,
    blasterStats, bladeStats, novaStats, weaponStats, formatTime,
    SurvivorScene, startSurvivor,
  };
}
