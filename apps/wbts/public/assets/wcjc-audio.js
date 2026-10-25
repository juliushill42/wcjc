/* WeCanJusChill — audio only. Never adds or changes visible page content. */
(() => {
  'use strict';
  if (window.__wcjcIntroAudioStarted) return;
  window.__wcjcIntroAudioStarted = true;

  const audio = new Audio('/assets/wecanjuschill-48s.mp3');
  audio.preload = 'auto';
  audio.volume = 1;
  audio.loop = false; // The MP3 already contains exactly two back-to-back plays.
  let started = false;
  let pending = false;

  const removeFallback = () => {
    for (const event of ['pointerdown', 'touchstart', 'keydown']) {
      window.removeEventListener(event, start, true);
    }
  };

  function start() {
    if (started || pending || audio.ended) return;
    pending = true;
    try {
      const result = audio.play();
      if (result && typeof result.then === 'function') {
        result.then(() => {
          started = true;
          pending = false;
          removeFallback();
        }).catch(() => {
          pending = false; // Browser prevented audible autoplay: retry on user interaction.
        });
      } else {
        started = true;
        pending = false;
        removeFallback();
      }
    } catch (_) {
      pending = false;
    }
  }

  // Try immediately; silent fallback waits for the first real interaction.
  for (const event of ['pointerdown', 'touchstart', 'keydown']) {
    window.addEventListener(event, start, { capture: true, passive: true });
  }
  start();
})();