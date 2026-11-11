# Starfall Survivor

A roguelike survivor game (Vampire Survivors-style), space / sci-fi
with a fantasy wink. Nova the salvager fights scrap drones, void
crawlers and spitters with a pulse blaster, orbiting energy blades
and a nova pulse — survive 5:00, then defeat the Void Dreadnought.

**V1 is in:** move-only combat with auto-firing weapons, XP gems,
level-up cards (pick 1 of 3), 3 enemy types + elites from 2:00,
Health / Magnet pickups, a 5:00 boss with a HP bar, victory and
game-over screens, and best time / best level in localStorage.
All art is procedural and all sounds are WebAudio — no external assets.

**Play it:** open `dist/index.html` in a browser (double-click works — the
Phaser library is inlined, so no server or internet is needed), or run
`python3 -m http.server` in this folder and open `http://localhost:8000/dist/`.

**Edit it in VSCode:** the source of truth is `src/` — `src/index.html`,
`src/style.css`, and `src/game.js` (commented as a learning example).
After editing, rebuild the playable bundle with:

```bash
# from this repo root (the script lives at ~/workspace/tools/inline-build.py):
python3 ../tools/inline-build.py src/index.html -o dist/index.html
```

Phaser 3.60 is bundled locally in `src/assets/phaser.min.js` (with a CDN
fallback in `src/index.html`), so the game works offline.

## How to play

- **Move: WASD / arrows, or hold the mouse** to move toward the pointer.
  Weapons fire on their own — no aiming.
- **Survive 5:00.** Enemies spawn off-screen in a ring around you; they
  get more numerous and tougher as the run goes on. Spawn interval
  shrinks from 1.2s to ~0.35s by 4:30, batch size grows 1 → 4, and
  enemy HP scales ×(1 + minutes × 0.35).
- **Enemies:**
  - **Scrap Drone** (from 0:00) — HP 12, fast, contact 8, drops a 1-XP gem.
  - **Void Crawler** (from 0:45) — HP 36, slow and tanky, contact 12, 3 XP.
  - **Spitter** (from 1:30) — HP 20, keeps ~220px away, shoots a
    projectile every 2.5s, 3 XP.
  - **Elites** (from 2:00, ~10% of spawns) — 3× HP, 1.6× size, gold,
    drop a 10-XP gem.
- **XP gems** (1 / 3 / 10) fly to you inside your pickup radius
  (70px at start). XP to the next level: 5, 9, 13, 17, … (5 + (level−1)×4).
  On level-up the game pauses and shows **3 cards — pick 1** with
  **1 / 2 / 3** or a click.
- **Weapons (max 3 owned, each max Lv 5):**
  - **Pulse Blaster** (starting weapon) — auto-fires at the nearest
    enemy. Lv 5: damage 22, 3 projectiles, ~3.3 shots/s.
  - **Orbital Blades** — energy blades orbit you (radius 70 → 102)
    and slice on contact. Lv 5: 4 blades, damage 24.
  - **Nova Pulse** — a radial burst every 4s → 2.4s, damage 18 → 34,
    radius 140 → 220, with knockback.
- **Level-up cards also include:** +20 max HP and heal 20, +15% move
  speed, +20% damage (all weapons), +15% magnet radius, +1 armour
  (contact hits deal 1 less, never below 3). Maxed weapons are never
  offered, and a 4th weapon is never offered.
- **Pickups:** **Health Cell** (+25 HP, ~5% of kills), **Magnet Cell**
  (collects every gem on the map, ~3% of kills).
- **Boss at 5:00 — the Void Dreadnought:** HP 1200, contact 20,
  spawns a Scrap Drone every 6s and fires an 8-way bullet burst
  every 5s. Kill it to win. Its HP bar is at the top of the screen.
- **P** pauses. Dying shows time survived, level and kills; winning
  shows the same plus a victory message. Best time and best level
  are saved in localStorage and shown on the title screen.

## Files

```
src/
  index.html          Page shell + Phaser loader (local copy, CDN fallback)
  style.css           Page chrome only — the game is drawn by Phaser
  game.js             The whole game, commented as a learning example
  assets/
    phaser.min.js     Phaser 3.60.0, bundled locally (MIT licence, see CREDITS.md)
dist/
  index.html          Single-file playable build (Phaser + CSS + game inlined)
docs/
  index.html          Byte-identical copy of dist/index.html, for GitHub Pages
README.md
CREDITS.md
```

After every rebuild, re-copy the playable build to `docs/` so Pages stays
in sync:

```bash
cp dist/index.html docs/index.html
```

## What's not in V1 (ideas for later)

More weapons / evolutions, more enemy types, multiple heroes, meta
progression between runs, save-to-localStorage for builds, mobile
touch joystick, harder post-boss endless mode.
