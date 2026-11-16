// main.js — tiny entry point: wires the boot function up and starts the game.
// Imports: startSurvivor from './scene.js'. Phaser is already loaded by the
// classic <script> in index.html before this module runs.
import { startSurvivor } from './scene.js';

window.__startSurvivor = startSurvivor;

// Start the game once Phaser is available — the same handshake index.html
// uses (local Phaser, else one CDN fallback). index.html's own boot script
// runs the same check on DOMContentLoaded but no-ops once booted is true,
// so the game is created exactly once.
(function boot() {
  function start() {
    if (window.__survivorBoot && window.__survivorBoot.booted) return;
    if (typeof window.__startSurvivor === "function" && window.__startSurvivor()) {
      window.__survivorBoot.booted = true;
    } else if (typeof window.__survivorShowFail === "function") {
      window.__survivorShowFail("Phaser loaded but the game did not start.");
    }
  }
  if (typeof Phaser !== "undefined") {
    start();
  } else {
    // Local copy failed — try the CDN, once.
    var s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/phaser@3.60.0/dist/phaser.min.js";
    s.onload = start;
    s.onerror = function () {
      if (typeof window.__survivorShowFail === "function") {
        window.__survivorShowFail("Could not load Phaser (local copy or CDN).");
      }
    };
    document.head.appendChild(s);
  }
})();
