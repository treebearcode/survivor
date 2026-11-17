// scene.js — §5 SurvivorScene (the one scene) + §6 BOOT (startSurvivor).
// Phaser comes from the classic <script> in index.html (window.Phaser)
// — it is NOT imported here, and there are no bare package names.
// Imports: config, helpers, sound, textures (all relative, with .js).
// Dev note: ES modules do NOT work by double-clicking (file:// blocks
// imports). Run a local server from the docs/ folder, e.g.
// `python3 -m http.server` in docs/, or VSCode Live Server.
// GitHub Pages needs no build step — it serves these files as-is.

import { CONFIG, ENEMY_TYPES, WEAPONS } from './config.js';
import { xpForLevel, spawnIntervalSec, spawnBatchSize, enemyHpScale, unlockedEnemyTypes, damageAfterArmour, blasterStats, bladeStats, novaStats, seekerStats, mineStats, formatTime } from './helpers.js';
import { sfx } from './sound.js';
import { makePlayerTexture, makeDroneTexture, makeCrawlerTexture, makeSpitterTexture, makeBossTexture, makeGemTexture, makeBulletTexture, makeBladeTexture, makeMissileTexture, makeMineTexture, makePickupTexture, makeStarTexture, makeNebulaTexture, makeRingTexture } from './textures.js';

// ---------------------------------------------------------------------------
// 5. SurvivorScene — the one scene. create() builds the world once;
//    update(time, delta) is the GAME LOOP, called ~60x/second.
//    All timers use `delta` (ms since last frame) so P-pause freezes
//    everything cleanly: when not playing, update() returns early
//    and no timer advances.
// ---------------------------------------------------------------------------
export class SurvivorScene extends Phaser.Scene {
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
    this.nextSwarmAt = CONFIG.swarmFirstSec;
    this.blasterTimer = 0;
    this.novaTimer = 0;
    this.seekerTimer = 0;
    this.mineTimer = 0;
    this.bladeAngle = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.bossDroneTimer = 0;
    this.bossBurstTimer = 0;
    this.levelUpQueue = 0;
    this.levelUpOptions = [];
    this.levelUpCardBgs = [];
    this.bestTime = 0;
    this.bestLevel = 0;
  }

  create() {
    // Fresh run state: scene.restart() re-runs create() but NOT the
    // constructor, so without this a restart kept the dead run's
    // HP, level, perks and scaling.
    this.resetRunState();
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
    makeMissileTexture(this);
    makeMineTexture(this);
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
    this.mines = this.physics.add.group();

    // --- Overlaps (group vs group / group vs player) ---
    this.physics.add.overlap(this.playerBullets, this.enemies,
      (bullet, enemy) => this.onBulletHitEnemy(bullet, enemy));
    // NOTE: for a group-vs-sprite overlap Phaser calls the callback
    // as (sprite, groupChild) whatever order the objects were passed
    // in — so the enemy / bullet is the SECOND argument here, not
    // the first. (The first argument is the player; reading .dmg off
    // it gives undefined, which poisoned HP to NaN on first contact.)
    this.physics.add.overlap(this.enemies, this.player,
      (player, enemy) => this.onEnemyTouchPlayer(enemy));
    this.physics.add.overlap(this.enemyBullets, this.player,
      (player, bullet) => this.onEnemyBulletHit(bullet));
    this.physics.add.overlap(this.blades, this.enemies,
      (blade, enemy) => this.onBladeHitEnemy(blade, enemy));
    this.physics.add.overlap(this.mines, this.enemies,
      (mine, enemy) => this.onMineTouch(mine, enemy));
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

    // Damage numbers: a reusable pool of floating texts. showDamageNumber()
    // takes the first hidden one, so a busy pool just skips a number.
    this.damageNumbers = [];
    for (let i = 0; i < 24; i++) {
      const t = this.add.text(0, 0, "", {
        fontSize: "15px", color: "#ffd23f", fontStyle: "bold",
      }).setDepth(25).setStroke("#000000", 3).setVisible(false);
      this.damageNumbers.push(t);
    }

    // Death sparks: one emitter, fired in bursts at each kill.
    this.deathParticles = this.add.particles(0, 0, "star", {
      emitting: false,
      speed: { min: 60, max: 220 },
      lifespan: 600,
      scale: { start: 1.1, end: 0 },
      tint: [0x2de2ff, 0xffd23f, 0xff2e63],
    });

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
    this.hudHpText = this.add.text(226, 38, "HP 100/100", {
      fontSize: "15px", color: "#ffffff", fontStyle: "bold",
    }).setOrigin(0, 0).setScrollFactor(0).setDepth(20);
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
    // HP bar (top-left, under the level text): dark backing, bright
    // border so the empty bar is still visible, plus an "HP 87/100"
    // readout — a bare thin strip on a dark background reads as nothing.
    this.hpBarG.clear();
    this.hpBarG.fillStyle(0x000000, 0.75).fillRect(14, 38, 204, 18);
    const hpFrac = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBarG.fillStyle(hpFrac > 0.35 ? 0x4ade80 : 0xff2e63, 1)
      .fillRect(16, 40, 200 * hpFrac, 14);
    this.hpBarG.lineStyle(2, 0xffffff, 0.85).strokeRect(14, 38, 204, 18);
    this.hudHpText.setText("HP " + this.hp + "/" + this.maxHp);
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
  // Each is a container, hidden until needed. All clicks go through
  // the scene-level pointer handlers below (the same path the title
  // screen uses), including level-up cards, which are picked by
  // their screen position. Keyboard shortcuts are handled in update().
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
    // screen, pick a level-up card by its screen position. One click
    // can never do two things: each branch only runs in its own state.
    this.input.on("pointerdown", (pointer) => {
      if (this.state === "levelup") {
        const i = this.levelUpCardAt(pointer.x, pointer.y);
        if (i >= 0) this.pickLevelUp(i);
      } else if (this.state === "title") this.startRun();
      else if (this.state === "gameover" || this.state === "victory") this.restartRun();
    });
    // Hover highlight for level-up cards, with a hand cursor.
    this.input.on("pointermove", (pointer) => {
      if (this.state !== "levelup" || !this.levelUpCardBgs) return;
      const i = this.levelUpCardAt(pointer.x, pointer.y);
      this.levelUpCardBgs.forEach((bg, j) =>
        bg.setFillStyle(j === i ? 0x14335f : 0x0a1a3a, 0.95));
      this.input.setDefaultCursor(i >= 0 ? "pointer" : "default");
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

  // Every number that defines a run, back to its starting value.
  // Best time/level are NOT run state — they live in localStorage
  // and survive on purpose.
  resetRunState() {
    this.elapsed = 0;
    this.kills = 0;
    this.level = 1;
    this.xp = 0;
    this.xpNext = xpForLevel(1);
    this.hp = CONFIG.playerMaxHp;
    this.maxHp = CONFIG.playerMaxHp;
    this.weapons = {};
    this.damageMult = 1;
    this.speedMult = 1;
    this.magnetMult = 1;
    this.armour = 0;
    this.invulnUntil = 0;
    this.spawnTimer = 0;
    this.nextSwarmAt = CONFIG.swarmFirstSec;
    this.blasterTimer = 0;
    this.novaTimer = 0;
    this.seekerTimer = 0;
    this.mineTimer = 0;
    this.bladeAngle = 0;
    this.boss = null;
    this.bossSpawned = false;
    this.bossDroneTimer = 0;
    this.bossBurstTimer = 0;
    this.levelUpQueue = 0;
    this.levelUpOptions = [];
    this.levelUpCardBgs = [];
  }

  startRun() {
    this.titleBox.setVisible(false);
    // Fresh run, even after a game over: everything resets, not
    // just the weapons.
    this.resetRunState();
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

    // Swarm rings: every 40s a ring of drones closes in on the
    // player — the surrounded moments Orbital Blades are built for.
    if (this.elapsed >= this.nextSwarmAt) {
      this.nextSwarmAt += CONFIG.swarmEverySec;
      this.spawnSwarm();
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
    e.wobblePhase = Math.random() * Math.PI * 2;
    e.baseScale = isElite ? CONFIG.eliteScale : 1;
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

  spawnSwarm() {
    // A ring of drones around the player, just off-screen, all closing in.
    for (let i = 0; i < CONFIG.swarmCount; i++) {
      const a = (i / CONFIG.swarmCount) * Math.PI * 2;
      const dist = 560 + Math.random() * 60;
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(a) * dist, 20, CONFIG.worldWidth - 20);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(a) * dist, 20, CONFIG.worldHeight - 20);
      this.spawnEnemyAt(x, y, "drone", false);
    }
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
    b.wobblePhase = 0;
    b.baseScale = 1;
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

      // Separation: push away from overlapping neighbours, as velocity
      // rather than a position shove — enemies slide around each other
      // instead of jamming. (A position shove via body.reset() zeroes
      // velocity, which froze overlapping mobs in place.) Bosses skip
      // this: they plough through the crowd.
      if (!e.isBoss) {
        const ra = ENEMY_TYPES[e.eType].radius * (e.isElite ? CONFIG.eliteScale : 1);
        this.enemies.getChildren().forEach((o) => {
          if (o === e || !o.active || o.isBoss) return;
          const rb = ENEMY_TYPES[o.eType].radius * (o.isElite ? CONFIG.eliteScale : 1);
          const minD = ra + rb;
          const sx = e.x - o.x, sy = e.y - o.y;
          const d2 = sx * sx + sy * sy;
          if (d2 >= minD * minD) return;
          const dist = Math.sqrt(d2);
          const nx = dist > 0 ? sx / dist : 1, ny = dist > 0 ? sy / dist : 0;
          const push = (1 - dist / minD) * 140; // up to 140 px/s at full overlap
          vx += nx * push;
          vy += ny * push;
        });
      }

      // Nova-pulse knockback decays over ~0.25s on top of steering.
      if (e.knockT > 0) {
        vx += e.knockVX; vy += e.knockVY;
        e.knockT -= dt;
        e.knockVX *= 0.88; e.knockVY *= 0.88;
      }
      // Movement animation: each type moves differently, so the
      // eye reads them as alive — drones rock, crawlers squash
      // and stretch as they crawl, spitters pulse, the boss breathes.
      const wob = time / 1000 + (e.wobblePhase || 0);
      const base = e.baseScale || 1;
      if (e.isBoss) {
        e.setScale(base * (1 + 0.05 * Math.sin(wob * 1.5)));
        e.setAngle(Math.sin(wob) * 4);
      } else if (e.eType === "crawler") {
        const s = Math.sin(wob * 6);
        e.setScale(base * (1 + 0.08 * s), base * (1 - 0.08 * s));
      } else if (e.eType === "spitter") {
        const s = 1 + 0.07 * Math.sin(wob * 4);
        e.setScale(base * s, base * s);
      } else {
        e.setAngle(Math.sin(wob * 2.5) * 18);
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

    // Seeker Swarm: homing missiles at the nearest enemy.
    if (this.weapons.seeker) {
      this.seekerTimer += dt * 1000;
      const st = seekerStats(this.weapons.seeker);
      if (this.seekerTimer >= st.intervalMs) {
        this.seekerTimer = 0;
        const target = this.nearestEnemy(800);
        if (target) {
          for (let i = 0; i < st.missiles; i++) {
            const a = Math.atan2(target.y - this.player.y, target.x - this.player.x)
              + (i - (st.missiles - 1) / 2) * 0.3;
            const m = this.playerBullets.create(this.player.x, this.player.y, "missile");
            m.setDepth(3);
            m.dmg = st.dmg;
            m.life = 2500;
            m.homing = true;
            m.target = target;
            m.body.setCircle(7, 3, 3);
            m.setVelocity(Math.cos(a) * st.bulletSpeed, Math.sin(a) * st.bulletSpeed);
            m.setRotation(a + Math.PI / 2);
          }
          sfx.shoot();
        }
      }
    }

    // Star Mines: drop a mine behind Nova on a timer, up to the
    // level cap. Old untriggered mines fade after 25s.
    if (this.weapons.mines) {
      this.mineTimer += dt * 1000;
      const st = mineStats(this.weapons.mines);
      this.mines.getChildren().forEach((m) => {
        if (m.active && time - m.bornAt > st.lifeMs) m.destroy();
      });
      if (this.mineTimer >= st.intervalMs &&
          this.mines.getChildren().length < st.maxMines) {
        this.mineTimer = 0;
        const m = this.mines.create(this.player.x, this.player.y, "mine");
        m.setDepth(2);
        m.dmg = st.dmg;
        m.radius = st.radius;
        m.bornAt = time;
        m.armedAt = time + 500;
        m.body.setCircle(12, 4, 4);
        m.setScale(0.5);
        this.tweens.add({ targets: m, scale: 1, duration: 150 });
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
    this.cameras.main.shake(120, 0.004);
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
    const dealt = rawDmg * this.damageMult;
    enemy.hp -= dealt;
    this.showDamageNumber(enemy.x, enemy.y, dealt);
    // Flash white for a frame; elites go back to gold afterwards.
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!enemy.active) return;
      if (enemy.isElite) enemy.setTint(0xffd23f);
      else enemy.clearTint();
    });
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  // Floating damage number: first hidden pool text, up ~32px and faded
  // over ~600ms. If the whole pool is busy, skip silently.
  showDamageNumber(x, y, amount) {
    const t = this.damageNumbers.find((n) => !n.visible);
    if (!t) return;
    t.setText(String(Math.round(amount)));
    t.setPosition(x + Phaser.Math.Between(-8, 8), y - 10);
    t.setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: t, y: t.y - 32, alpha: 0, duration: 600,
      onComplete: () => t.setVisible(false),
    });
  }

  // Shove an enemy away from the player, using the same knockback
  // fields Nova Pulse uses (they decay in updateEnemies).
  shoveEnemy(enemy, magnitude, duration) {
    const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y;
    const dist = Math.hypot(dx, dy) || 1;
    enemy.knockVX = (dx / dist) * magnitude;
    enemy.knockVY = (dy / dist) * magnitude;
    enemy.knockT = duration;
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
    this.deathParticles.explode(14, x, y);
    // XP gem: elites drop a 10, everyone else their type value.
    // It pops in from half size over 120ms.
    const gem = this.gems.create(x, y, "gem-" + enemy.xpValue);
    gem.setDepth(2);
    gem.setScale(0.5);
    this.tweens.add({ targets: gem, scale: 1, duration: 120 });
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
    // Pickups gently pulse, so they read as friendly loot at a
    // glance — enemies wobble and rock instead, and wear the red outline.
    this.tweens.add({
      targets: p, scaleX: 1.18, scaleY: 1.18,
      duration: 450, yoyo: true, repeat: -1,
    });
  }

  onMineTouch(mine, enemy) {
    if (!mine.active || !enemy.active) return;
    if (this.time.now < mine.armedAt) return; // freshly dropped: not live yet
    this.explodeMine(mine);
  }

  explodeMine(mine) {
    const x = mine.x, y = mine.y, r = mine.radius, dmg = mine.dmg;
    mine.destroy();
    sfx.nova();
    this.cameras.main.shake(100, 0.003);
    const ring = this.add.image(x, y, "ring").setDepth(7);
    ring.setScale(0.3).setTint(0xff6b35);
    this.tweens.add({
      targets: ring, scale: r / 64, alpha: 0,
      duration: 300, onComplete: () => ring.destroy(),
    });
    this.enemies.getChildren().forEach((e) => {
      if (!e.active) return;
      const dx = e.x - x, dy = e.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist <= r + 20) {
        const d = dist || 1;
        e.knockVX = (dx / d) * 220;
        e.knockVY = (dy / d) * 220;
        e.knockT = 0.2;
        this.damageEnemy(e, dmg);
      }
    });
  }

  hurtPlayer(rawDmg, time) {
    if (time < this.invulnUntil || this.state !== "playing") return;
    const dmg = damageAfterArmour(rawDmg, this.armour);
    this.hp -= dmg;
    this.invulnUntil = time + CONFIG.invulnSec * 1000;
    sfx.hurt();
    this.cameras.main.shake(90, 0.003);
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
    this.cameras.main.shake(350, 0.008);
    this.setEndScreen(true);
  }

  onBulletHitEnemy(bullet, enemy) {
    if (!bullet.active || !enemy.active) return;
    const dmg = bullet.dmg;
    bullet.destroy();
    this.shoveEnemy(enemy, 140, 0.15);
    this.damageEnemy(enemy, dmg);
  }

  onBladeHitEnemy(blade, enemy) {
    if (!enemy.active || !this.weapons.blades) return;
    // One hit per enemy per 250ms — without this, a blade sitting on
    // an enemy would damage it every single frame.
    const now = this.time.now;
    if (now - enemy.lastBladeHit < 250) return;
    enemy.lastBladeHit = now;
    this.shoveEnemy(enemy, 200, 0.15);
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
    this.tweens.killTweensOf(gem); // stop the pop-in tween, if still running
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
        if (b.life <= 0) { b.destroy(); return; }
        // Seeker missiles steer toward their target; if it died,
        // they fly straight on.
        if (b.homing) {
          const t = b.target;
          if (t && t.active) {
            const a = Math.atan2(t.y - b.y, t.x - b.x);
            const sp = Math.hypot(b.body.velocity.x, b.body.velocity.y) || 380;
            b.setVelocity(Math.cos(a) * sp, Math.sin(a) * sp);
            b.setRotation(a + Math.PI / 2);
          }
        }
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
    if (id === "seeker") {
      const s = seekerStats(level);
      return s.missiles + " homing missile" + (s.missiles > 1 ? "s" : "") +
        ", damage " + s.dmg + ", every " + (s.intervalMs / 1000).toFixed(2) + "s.";
    }
    if (id === "mines") {
      const s = mineStats(level);
      return "Damage " + s.dmg + ", blast radius " + s.radius +
        ", up to " + s.maxMines + " mines.";
    }
    const s = novaStats(level);
    return "Damage " + s.dmg + ", radius " + s.radius +
      ", every " + (s.cooldownMs / 1000).toFixed(1) + "s.";
  }

  // Which level-up card (if any) sits under a game-coordinate point.
  // Cards are 240x190, centred at (200 + i*280, 280).
  levelUpCardAt(x, y) {
    if (this.state !== "levelup") return -1;
    for (let i = 0; i < this.levelUpOptions.length; i++) {
      const cx = 200 + i * 280, cy = 280;
      if (Math.abs(x - cx) <= 120 && Math.abs(y - cy) <= 95) return i;
    }
    return -1;
  }

  showLevelUp() {
    this.state = "levelup";
    this.physics.world.pause();
    sfx.levelup();
    this.levelUpOptions = this.buildLevelUpOptions();
    this.levelUpCardBgs = [];
    this.levelUpBox.removeAll(true);
    this.levelUpBox.add(this.add.text(CONFIG.width / 2, 92, "LEVEL UP!  Choose one:", {
      fontSize: "28px", color: "#ffd23f", fontStyle: "bold",
    }).setOrigin(0.5, 0));
    this.levelUpOptions.forEach((opt, i) => {
      const cx = 200 + i * 280, cy = 280;
      const card = this.add.container(cx, cy);
      const bg = this.add.rectangle(0, 0, 240, 190, 0x0a1a3a, 0.95)
        .setStrokeStyle(2, 0x2de2ff, 0.9);
      this.levelUpCardBgs.push(bg);
      card.add([
        bg,
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
      if (opt.weapon === "seeker") this.seekerTimer = 0;
      if (opt.weapon === "mines") this.mineTimer = 0;
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
      this.input.setDefaultCursor("default");
      this.physics.world.resume();
    }
  }
}

// ---------------------------------------------------------------------------
// 6. BOOT — index.html calls this once Phaser is loaded.
//    Returns false if Phaser isn't there (so the boot guard can show
//    the "couldn't start" message instead of crashing).
// ---------------------------------------------------------------------------
export function startSurvivor() {
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
