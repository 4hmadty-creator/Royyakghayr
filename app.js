/**
 * ROYYAK OPTICS - Ultra Smooth Scroll-Linked Frame Sequence Engine
 * Precision interactive canvas player with dynamic story overlays & audio feedback.
 */

(function () {
  'use strict';

  // --- Configuration ---
  const TOTAL_FRAMES = 300;
  const FRAME_PREFIX = 'ezgif-frame-';
  const FRAME_EXT = '.jpg';
  const FRAME_PAD = 3;
  const LERP_FACTOR = 0.12; // Smoothness factor for scroll & scrub interpolation

  // --- DOM Elements ---
  const canvas = document.getElementById('sequenceCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const viewport = document.getElementById('canvasViewport');
  const preloader = document.getElementById('preloader');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const framesLoadedText = document.getElementById('framesLoadedText');
  const startBtn = document.getElementById('startExperienceBtn');
  const playBtn = document.getElementById('playBtn');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const scrubberTrack = document.getElementById('scrubberTrack');
  const scrubberFill = document.getElementById('scrubberFill');
  const scrubberThumb = document.getElementById('scrubberThumb');
  const currentFrameDisplay = document.getElementById('currentFrameDisplay');
  const resetScrollBtn = document.getElementById('resetScrollBtn');
  const soundToggle = document.getElementById('soundToggle');
  const soundIconOn = document.getElementById('soundIconOn');
  const soundIconOff = document.getElementById('soundIconOff');
  const langToggle = document.getElementById('langToggle');
  const specDrawer = document.getElementById('specDrawer');
  const specDrawerOpen = document.getElementById('specDrawerOpen');
  const specDrawerClose = document.getElementById('specDrawerClose');
  const specDrawerCloseBtn = document.getElementById('specDrawerCloseBtn');
  const chapterPills = document.querySelectorAll('.chapter-pill');
  const storyCards = document.querySelectorAll('.story-card');
  const speedButtons = document.querySelectorAll('.speed-btn');
  const dragHint = document.getElementById('dragHint');
  const specSelectButtons = document.querySelectorAll('.spec-select-btn');

  // --- State Variables ---
  const images = new Array(TOTAL_FRAMES + 1);
  let loadedCount = 0;
  let currentFrame = 1;
  let targetFrame = 1;
  let lastRenderedFrame = -1;
  let isPlaying = false;
  let playbackSpeed = 1.0;
  let playAnimationId = null;
  let soundEnabled = true;
  let isDraggingScrubber = false;
  let isDraggingCanvas = false;
  let dragStartX = 0;
  let dragStartFrame = 1;
  let lastTickFrame = 1;
  let currentLang = 'en'; // 'en' or 'ar'
  let audioCtx = null;

  // --- Helper: Frame File Path ---
  function getFrameSrc(index) {
    const padded = String(index).padStart(FRAME_PAD, '0');
    return `${FRAME_PREFIX}${padded}${FRAME_EXT}`;
  }

  // --- Web Audio Tick Synthesizer ---
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
  }

  function playTickSound(frequency = 440) {
    if (!soundEnabled || !audioCtx || audioCtx.state !== 'running') return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.5, audioCtx.currentTime + 0.03);

      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.03);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.03);
    } catch (e) {
      // Audio context might be restricted
    }
  }

  // --- Canvas Sizing & Crisp Retina Rendering ---
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = viewport.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Invalidate last rendered frame to trigger fresh redraw
    lastRenderedFrame = -1;
  }

  // --- High Quality Aspect-Preserved Frame Drawing ---
  function renderFrame(frameNum) {
    const rounded = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(frameNum)));
    
    // Find closest loaded frame if current frame is still loading
    let imgToDraw = images[rounded];
    if (!imgToDraw || !imgToDraw.complete || imgToDraw.naturalWidth === 0) {
      for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
        const next = rounded + offset;
        const prev = rounded - offset;
        if (next <= TOTAL_FRAMES && images[next] && images[next].complete && images[next].naturalWidth > 0) {
          imgToDraw = images[next];
          break;
        }
        if (prev >= 1 && images[prev] && images[prev].complete && images[prev].naturalWidth > 0) {
          imgToDraw = images[prev];
          break;
        }
      }
    }

    if (!imgToDraw || !imgToDraw.complete || imgToDraw.naturalWidth === 0) {
      return;
    }

    if (rounded === lastRenderedFrame) return;
    lastRenderedFrame = rounded;

    const cw = canvas.width;
    const ch = canvas.height;
    const iw = imgToDraw.naturalWidth || 1920;
    const ih = imgToDraw.naturalHeight || 1080;

    // Calculate aspect fit ("contain")
    const scale = Math.min(cw / iw, ch / ih);
    const nw = iw * scale;
    const nh = ih * scale;
    const nx = (cw - nw) / 2;
    const ny = (ch - nh) / 2;

    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(imgToDraw, 0, 0, iw, ih, nx, ny, nw, nh);

    // Audio click feedback when scrubbing through key landmarks
    if (Math.abs(rounded - lastTickFrame) >= 2) {
      const isMilestone = (rounded % 30 === 0);
      playTickSound(isMilestone ? 720 : 380);
      lastTickFrame = rounded;
    }

    updateHUD(rounded);
  }

  // --- Main Animation & Lerp Smoothing Loop ---
  function animationLoop() {
    // Smooth target interpolation
    currentFrame += (targetFrame - currentFrame) * LERP_FACTOR;
    
    renderFrame(currentFrame);
    requestAnimationFrame(animationLoop);
  }

  // --- Scroll Tracking ---
  function handleScroll() {
    if (isDraggingScrubber || isPlaying) return;

    const scrollY = window.scrollY || window.pageYOffset;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    
    if (maxScroll <= 0) return;

    const progress = Math.max(0, Math.min(1, scrollY / maxScroll));
    targetFrame = 1 + progress * (TOTAL_FRAMES - 1);
  }

  // --- Jump to Frame Smoothly via Scroll ---
  function jumpToFrame(frameIndex, smooth = true) {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = (frameIndex - 1) / (TOTAL_FRAMES - 1);
    const targetScrollY = progress * maxScroll;

    window.scrollTo({
      top: targetScrollY,
      behavior: smooth ? 'smooth' : 'auto'
    });

    targetFrame = frameIndex;
  }

  // --- Update HUD UI & Story Overlays ---
  function updateHUD(frame) {
    // 1. Update text counter
    if (currentFrameDisplay) {
      currentFrameDisplay.textContent = String(frame).padStart(3, '0');
    }

    // 2. Update scrubber progress bar & thumb
    const progressPercent = ((frame - 1) / (TOTAL_FRAMES - 1)) * 100;
    if (scrubberFill) scrubberFill.style.width = `${progressPercent}%`;
    if (scrubberThumb) {
      if (document.documentElement.getAttribute('dir') === 'rtl') {
        scrubberThumb.style.right = `${progressPercent}%`;
        scrubberThumb.style.left = 'auto';
      } else {
        scrubberThumb.style.left = `${progressPercent}%`;
        scrubberThumb.style.right = 'auto';
      }
    }

    // 3. Update Story Cards visibility based on active ranges
    storyCards.forEach(card => {
      const range = card.dataset.range.split('-').map(Number);
      const start = range[0];
      const end = range[1];

      if (frame >= start && frame <= end) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });

    // 4. Update Chapter Pill active state
    chapterPills.forEach(pill => {
      const pillFrame = parseInt(pill.dataset.frame, 10);
      let isActive = false;

      if (pillFrame === 1 && frame < 50) isActive = true;
      else if (pillFrame === 60 && frame >= 50 && frame < 120) isActive = true;
      else if (pillFrame === 180 && frame >= 120 && frame < 240) isActive = true;
      else if (pillFrame === 300 && frame >= 240) isActive = true;

      if (isActive) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  // --- Autoplay Controller ---
  function togglePlay() {
    initAudio();
    if (isPlaying) {
      stopAutoplay();
    } else {
      startAutoplay();
    }
  }

  function startAutoplay() {
    isPlaying = true;
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');

    let lastTime = performance.now();

    function stepPlay(now) {
      if (!isPlaying) return;

      const delta = (now - lastTime) / 1000;
      lastTime = now;

      // Base speed: 30 frames per second at 1.0x
      const framesToAdvance = 30 * playbackSpeed * delta;
      let nextFrame = targetFrame + framesToAdvance;

      if (nextFrame > TOTAL_FRAMES) {
        nextFrame = 1; // Loop
      }

      targetFrame = nextFrame;
      
      // Update actual scroll position to keep in sync
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = (targetFrame - 1) / (TOTAL_FRAMES - 1);
      window.scrollTo(0, progress * maxScroll);

      playAnimationId = requestAnimationFrame(stepPlay);
    }

    playAnimationId = requestAnimationFrame(stepPlay);
  }

  function stopAutoplay() {
    isPlaying = false;
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
    if (playAnimationId) {
      cancelAnimationFrame(playAnimationId);
      playAnimationId = null;
    }
  }

  // --- Interactive Scrubber Drag & Click ---
  function handleScrubberInput(e) {
    initAudio();
    stopAutoplay();

    const rect = scrubberTrack.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
    
    let ratio = (clientX - rect.left) / rect.width;
    if (isRtl) ratio = 1 - ratio;
    
    ratio = Math.max(0, Math.min(1, ratio));
    const targetIdx = Math.round(1 + ratio * (TOTAL_FRAMES - 1));

    jumpToFrame(targetIdx, false);
  }

  // --- Interactive Canvas Drag Scrubbing ---
  function initCanvasDrag() {
    viewport.addEventListener('mousedown', (e) => {
      initAudio();
      stopAutoplay();
      isDraggingCanvas = true;
      dragStartX = e.clientX;
      dragStartFrame = targetFrame;
      if (dragHint) dragHint.classList.add('hidden');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDraggingCanvas) return;
      const dx = e.clientX - dragStartX;
      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      const frameDelta = (isRtl ? -dx : dx) * 0.4;
      const newFrame = Math.max(1, Math.min(TOTAL_FRAMES, dragStartFrame + frameDelta));
      jumpToFrame(newFrame, false);
    });

    window.addEventListener('mouseup', () => {
      isDraggingCanvas = false;
    });

    // Touch Support for Mobile Drag
    viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        initAudio();
        stopAutoplay();
        isDraggingCanvas = true;
        dragStartX = e.touches[0].clientX;
        dragStartFrame = targetFrame;
        if (dragHint) dragHint.classList.add('hidden');
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isDraggingCanvas || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - dragStartX;
      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      const frameDelta = (isRtl ? -dx : dx) * 0.5;
      const newFrame = Math.max(1, Math.min(TOTAL_FRAMES, dragStartFrame + frameDelta));
      jumpToFrame(newFrame, false);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDraggingCanvas = false;
    });
  }

  // --- Preload Engine with Smart Concurrency & Cache ---
  function preloadImages() {
    let loaded = 0;
    
    // Load first frame immediately to render initial view fast
    const firstImg = new Image();
    firstImg.src = getFrameSrc(1);
    firstImg.onload = () => {
      images[1] = firstImg;
      loaded++;
      renderFrame(1);
    };

    // Load remaining frames
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      if (i === 1) continue;

      const img = new Image();
      img.src = getFrameSrc(i);

      const onComplete = () => {
        loaded++;
        loadedCount = loaded;
        images[i] = img;

        const percent = Math.floor((loaded / TOTAL_FRAMES) * 100);
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressText) progressText.textContent = `${percent}%`;
        if (framesLoadedText) framesLoadedText.textContent = `${loaded} / ${TOTAL_FRAMES} Frames`;

        // When sufficient frames are loaded (or all), enable entering
        if (loaded >= 30 && startBtn && startBtn.classList.contains('hidden')) {
          startBtn.classList.remove('hidden');
        }

        if (loaded === TOTAL_FRAMES) {
          setTimeout(dismissPreloader, 400);
        }
      };

      img.onload = onComplete;
      img.onerror = onComplete;
    }
  }

  function dismissPreloader() {
    if (!preloader) return;
    preloader.classList.add('fade-out');
    document.body.classList.remove('loading-state');
  }

  // --- Bilingual Language Switcher ---
  function toggleLanguage() {
    currentLang = (currentLang === 'en') ? 'ar' : 'en';
    const isAr = (currentLang === 'ar');

    document.documentElement.setAttribute('lang', isAr ? 'ar' : 'en');
    document.documentElement.setAttribute('dir', isAr ? 'rtl' : 'ltr');
    document.body.setAttribute('dir', isAr ? 'rtl' : 'ltr');

    langToggle.querySelector('.lang-text').textContent = isAr ? 'English' : 'العربية';

    // Update all localized texts
    document.querySelectorAll('[data-en][data-ar]').forEach(el => {
      el.innerHTML = isAr ? el.getAttribute('data-ar') : el.getAttribute('data-en');
    });

    // Re-render frame HUD positioning
    updateHUD(Math.round(currentFrame));
  }

  // --- Event Listeners Setup ---
  function setupEventListeners() {
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', resizeCanvas);

    // Start Experience button in preloader
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        initAudio();
        dismissPreloader();
      });
    }

    // Play/Pause button
    if (playBtn) {
      playBtn.addEventListener('click', togglePlay);
    }

    // Speed selector buttons
    speedButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        speedButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        playbackSpeed = parseFloat(btn.dataset.speed) || 1.0;
      });
    });

    // Scrubber click & drag events
    if (scrubberTrack) {
      scrubberTrack.addEventListener('mousedown', (e) => {
        isDraggingScrubber = true;
        handleScrubberInput(e);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDraggingScrubber) handleScrubberInput(e);
      });

      window.addEventListener('mouseup', () => {
        isDraggingScrubber = false;
      });

      scrubberTrack.addEventListener('touchstart', (e) => {
        isDraggingScrubber = true;
        handleScrubberInput(e);
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (isDraggingScrubber) handleScrubberInput(e);
      }, { passive: true });

      window.addEventListener('touchend', () => {
        isDraggingScrubber = false;
      });
    }

    // Chapter Navigation Pills
    chapterPills.forEach(pill => {
      pill.addEventListener('click', () => {
        initAudio();
        stopAutoplay();
        const target = parseInt(pill.dataset.frame, 10);
        jumpToFrame(target, true);
      });
    });

    // Reset Scroll button
    if (resetScrollBtn) {
      resetScrollBtn.addEventListener('click', () => {
        initAudio();
        stopAutoplay();
        jumpToFrame(1, true);
      });
    }

    // Sound Toggle
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        if (soundEnabled) {
          initAudio();
          soundIconOn.classList.remove('hidden');
          soundIconOff.classList.add('hidden');
        } else {
          soundIconOn.classList.add('hidden');
          soundIconOff.classList.remove('hidden');
        }
      });
    }

    // Language Toggle
    if (langToggle) {
      langToggle.addEventListener('click', toggleLanguage);
    }

    // Spec Drawer
    if (specDrawerOpen) {
      specDrawerOpen.addEventListener('click', () => {
        specDrawer.classList.add('open');
        specDrawer.setAttribute('aria-hidden', 'false');
      });
    }

    function closeDrawer() {
      specDrawer.classList.remove('open');
      specDrawer.setAttribute('aria-hidden', 'true');
    }

    if (specDrawerClose) specDrawerClose.addEventListener('click', closeDrawer);
    if (specDrawerCloseBtn) specDrawerCloseBtn.addEventListener('click', closeDrawer);

    // Spec card jump buttons
    specSelectButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const frameIdx = parseInt(btn.dataset.jump, 10);
        closeDrawer();
        jumpToFrame(frameIdx, true);
      });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        stopAutoplay();
        jumpToFrame(Math.min(TOTAL_FRAMES, targetFrame + 5), false);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        stopAutoplay();
        jumpToFrame(Math.max(1, targetFrame - 5), false);
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpToFrame(1, true);
      } else if (e.key === 'End') {
        e.preventDefault();
        jumpToFrame(TOTAL_FRAMES, true);
      }
    });

    initCanvasDrag();
  }

  // --- Initialization ---
  function init() {
    resizeCanvas();
    preloadImages();
    setupEventListeners();
    handleScroll();
    requestAnimationFrame(animationLoop);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
