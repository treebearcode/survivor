# Starfall Survivor

A roguelike survivor game (Vampire Survivors-style), space / sci-fi
with a fantasy wink. Nova the salvager fights scrap drones, void
crawlers and spitters with a pulse blaster, orbiting energy blades
and a nova pulse — survive 5:00, then defeat the Void Dreadnought.

## Features

- Move-only survivor — WASD / arrows or hold-mouse to move, weapons
  fire on their own, no aiming.
- 5:00 run, then the Void Dreadnought boss (HP 1200, with a HP bar) —
  kill it to win.
- 3 weapons, each up to Lv 5: Pulse Blaster, Orbital Blades, Nova Pulse.
- 3 enemy types (Scrap Drone, Void Crawler, Spitter) + gold elites
  from 2:00, and swarm rings of 10 drones every 40s from 0:30.
- XP gems, level-up cards (pick 1 of 3), plus stat upgrades
  (+max HP, +speed, +damage, +magnet, +armour).
- Health / Magnet pickups, victory and game-over screens, best time
  and best level saved in localStorage.
- All art is procedural and all sounds are WebAudio — no external assets.
- ES modules in `docs/`, no build step — Pages serves it as-is.

**Play it:** live at https://treebearcode.github.io/survivor/ (GitHub
Pages serves `docs/` as-is — no build step).

**Play / edit it locally:** the source of truth is `docs/` — edit the
files there directly, no build, no bundling. ES modules do NOT work by
double-clicking (`file://` blocks imports), so serve `docs/` instead:

```bash
cd docs
python3 -m http.server
# open http://localhost:8000/
```

Or use VSCode Live Server on `docs/index.html`.

Phaser 3.60 is bundled locally in `docs/assets/phaser.min.js` (with a CDN
fallback in `docs/index.html`), so the game works offline once loaded.

## How to play

- **Move: WASD / arrows, or hold the mouse** to move toward the pointer.
  Weapons fire on their own — no aiming.
- **Survive 5:00.** Enemies spawn off-screen in a ring around you; they
  get more numerous and tougher as the run goes on. Spawn interval
  shrinks from 0.9s to ~0.35s by 4:30, batch size grows 1 → 4, and
  enemy HP scales ×(1 + minutes × 0.35). Every 40s from 0:30 a swarm
  ring of 10 drones closes in on you.
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
  - **Orbital Blades** — energy blades orbit you (radius 85 → 117)
    and slice on contact. Lv 5: 5 blades, damage 26.
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

## Files (ES modules, dev directly in `docs/`)

```
docs/                 Source of truth AND the GitHub Pages folder — edit here
  index.html          Page shell + Phaser loader (local copy, CDN fallback)
  style.css           Page chrome only — the game is drawn by Phaser
  main.js             Entry: exposes window.__startSurvivor, boots the game
  config.js           Tuning: CONFIG, ENEMY_TYPES, WEAPONS
  helpers.js          Pure helpers: XP, spawn rates, weapon stats by level
  sound.js            WebAudio beeps (beep, sfx)
  textures.js         Procedural art: all make*Texture functions
  scene.js            SurvivorScene + startSurvivor (the game itself)
  assets/
    phaser.min.js     Phaser 3.60.0, bundled locally (MIT licence, see CREDITS.md)
README.md
CREDITS.md
```

Phaser is loaded as a classic script (a global) in `index.html`; only
our own code is ES modules. Every import is a full relative path with
the `.js` extension. No build step — push `docs/` and Pages serves it.

## Ideas for later

More weapons / evolutions, more enemy types, multiple heroes, meta
progression between runs, save-to-localStorage for builds, mobile
touch joystick, harder post-boss endless mode.
