// sound.js — §3 SOUND: tiny WebAudio beeps, no audio files.
// Imports: none. Imported by scene.js.
// Dev note: ES modules do NOT work by double-clicking (file:// blocks
// imports). Run a local server from the docs/ folder, e.g.
// `python3 -m http.server` in docs/, or VSCode Live Server.
// GitHub Pages needs no build step — it serves these files as-is.

// ---------------------------------------------------------------------------
// 3. SOUND — WebAudio beeps. No audio files, no Phaser sound manager.
//    Created lazily on first user click (browsers block audio before
//    the user interacts with the page).
// ---------------------------------------------------------------------------
let _audioCtx = null;
export function beep(freq, durationMs, type, volume) {
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
export const sfx = {
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
