// textures.js — §4 TEXTURES: all art drawn in code with Phaser Graphics.
// Each function draws once into a texture that sprites then reuse.
// Imports: none (they only use the `scene` passed in). Imported by scene.js.
// Dev note: ES modules do NOT work by double-clicking (file:// blocks
// imports). Run a local server from the docs/ folder, e.g.
// `python3 -m http.server` in docs/, or VSCode Live Server.
// GitHub Pages needs no build step — it serves these files as-is.

// ---------------------------------------------------------------------------
// 4. TEXTURES — procedural art. Each function draws once into a texture
//    that sprites then reuse (cheap: one draw, many sprites).
//    To swap in real sprite art later, drop PNGs in src/assets/ and
//    replace a make*Texture() call with this.load.image() in preload()
//    — the game code only ever refers to the texture keys.
// ---------------------------------------------------------------------------
export function makePlayerTexture(scene) {
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
export function makeDroneTexture(scene) {
  const key = "drone";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x8a94a6, 1);                 // scrap-grey hull
  g.fillPoints([{ x: 16, y: 2 }, { x: 30, y: 16 }, { x: 16, y: 30 }, { x: 2, y: 16 }], true);
  // Hostile red outline: enemies always read as danger, never as loot.
  g.lineStyle(3, 0xff2e63, 1);
  g.beginPath();
  g.moveTo(16, 2); g.lineTo(30, 16); g.lineTo(16, 30); g.lineTo(2, 16);
  g.closePath(); g.strokePath();
  g.fillStyle(0xff6b35, 1);                 // rust-orange core
  g.fillCircle(16, 16, 6);
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(16, 16, 2.5);
  g.generateTexture(key, 32, 32);
  g.destroy();
  return key;
}
export function makeCrawlerTexture(scene) {
  const key = "crawler";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x9b5de5, 1);                 // void-purple blob
  g.fillCircle(22, 22, 18);
  // Hostile red outline: enemies always read as danger, never as loot.
  g.lineStyle(3, 0xff2e63, 1);
  g.strokeCircle(22, 22, 18);
  g.fillStyle(0x6d28a8, 1);
  g.fillCircle(14, 16, 7);
  g.fillCircle(30, 28, 6);
  g.fillStyle(0xff2e63, 1);                 // angry red eyes
  g.fillCircle(16, 20, 3);
  g.fillCircle(28, 20, 3);
  g.fillStyle(0x1a1a1a, 1);
  g.fillCircle(16, 20, 1.5);
  g.fillCircle(28, 20, 1.5);
  g.generateTexture(key, 44, 44);
  g.destroy();
  return key;
}
export function makeSpitterTexture(scene) {
  const key = "spitter";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0x2ec4b6, 1);                 // teal diamond
  g.fillPoints([{ x: 17, y: 1 }, { x: 33, y: 17 }, { x: 17, y: 33 }, { x: 1, y: 17 }], true);
  // Hostile red outline: enemies always read as danger, never as loot.
  g.lineStyle(3, 0xff2e63, 1);
  g.beginPath();
  g.moveTo(17, 1); g.lineTo(33, 17); g.lineTo(17, 33); g.lineTo(1, 17);
  g.closePath(); g.strokePath();
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
export function makeBossTexture(scene) {
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
export function makeGemTexture(scene, value) {
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
export function makeBulletTexture(scene, key, color) {
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
export function makeBladeTexture(scene) {
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
export function makePickupTexture(scene, key, color, cross) {
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
export function makeMissileTexture(scene) {
  const key = "missile";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Seeker missile: a gold dart with an orange body, nose up.
  g.fillStyle(0xffd23f, 1);
  g.fillPoints([{ x: 10, y: 1 }, { x: 16, y: 14 }, { x: 10, y: 11 }, { x: 4, y: 14 }], true);
  g.fillStyle(0xff6b35, 1);
  g.fillRect(7, 12, 6, 5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(10, 5, 2);
  g.generateTexture(key, 20, 20);
  g.destroy();
  return key;
}
export function makeMineTexture(scene) {
  const key = "mine";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  // Star mine: a dark spiked ball with a hot orange core.
  g.fillStyle(0x2a2a3a, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x1 = 16 + Math.cos(a) * 9, y1 = 16 + Math.sin(a) * 9;
    const x2 = 16 + Math.cos(a + 0.25) * 9, y2 = 16 + Math.sin(a + 0.25) * 9;
    const x3 = 16 + Math.cos(a + 0.125) * 15, y3 = 16 + Math.sin(a + 0.125) * 15;
    g.fillTriangle(x1, y1, x2, y2, x3, y3);
  }
  g.fillCircle(16, 16, 10);
  g.fillStyle(0xff6b35, 1);
  g.fillCircle(16, 16, 5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 2);
  g.generateTexture(key, 32, 32);
  g.destroy();
  return key;
}
export function makeStarTexture(scene) {
  const key = "star";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(2, 2, 2);
  g.generateTexture(key, 4, 4);
  g.destroy();
  return key;
}
export function makeNebulaTexture(scene) {
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
export function makeRingTexture(scene) {
  const key = "ring";
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  g.lineStyle(6, 0x2de2ff, 1);
  g.strokeCircle(64, 64, 58);
  g.generateTexture(key, 128, 128);
  g.destroy();
  return key;
}
