(() => {
  'use strict';

  // ===================================================================
  // Config & persistence
  // ===================================================================
  const STORAGE_KEY = 'prizeSpinner.v1';
  const TIERS = ['big', 'medium', 'small', 'lose'];
  const DOWNGRADE = { big: 'medium', medium: 'small', small: 'lose', lose: null };
  const MAX_PRIZES = 24;
  const MIN_PRIZES = 2;

  const TIER_META = {
    big:    { label: 'BIG PRIZE',    palette: ['#FFC93C', '#FFB01F'], text: '#4a2a00' },
    medium: { label: 'MEDIUM PRIZE', palette: ['#8E5CFF', '#5B6CFF'], text: '#ffffff' },
    small:  { label: 'PRIZE',        palette: ['#12C2A4', '#22A7F0', '#2DBE6C'], text: '#ffffff' },
    lose:   { label: 'NO PRIZE',     palette: ['#FF5D8F', '#FF8A5B', '#E2557E'], text: '#ffffff' },
  };
  const TIER_NAMES = { big: 'Big', medium: 'Medium', small: 'Small', lose: 'No prize' };

  const WIN_HEADLINES = {
    big: ['JACKPOT!', 'GRAND WINNER!', 'HUGE WIN!'],
    medium: ['Awesome Win!', 'Nice One!', 'Big Smiles!'],
    small: ['You Won!', 'Winner!', 'Sweet!'],
  };
  const LOSE_LINES = [
    'Not this time. Thanks for playing!',
    'So close! The wheel almost picked you.',
    'Thanks for giving it a spin!',
  ];

  const uid = () => Math.random().toString(36).slice(2, 10);

  function defaultConfig() {
    return {
      title: 'Spin to Win!',
      subtitle: 'One spin per player. Good luck!',
      prizes: [
        { id: uid(), emoji: '🏆', name: 'Grand Prize', tier: 'big', qty: null },
        { id: uid(), emoji: '🎁', name: 'Gift Card', tier: 'medium', qty: null },
        { id: uid(), emoji: '👜', name: 'Tote Bag', tier: 'medium', qty: null },
        { id: uid(), emoji: '🍬', name: 'Candy', tier: 'small', qty: null },
        { id: uid(), emoji: '✨', name: 'Sticker Pack', tier: 'small', qty: null },
        { id: uid(), emoji: '🖊️', name: 'Pen', tier: 'small', qty: null },
        { id: uid(), emoji: '🔄', name: 'Try Again', tier: 'lose', qty: null },
        { id: uid(), emoji: '😅', name: 'Sorry!', tier: 'lose', qty: null },
        { id: uid(), emoji: '🍀', name: 'Better Luck Next Time', tier: 'lose', qty: null },
      ],
      // Percent chance per spin. "lose" is the remainder (100 - sum).
      odds: { big: 10, medium: 25, small: 50 },
      mode: 'deck', // 'deck' = guaranteed ratio, 'random' = independent spins
      sound: true,
      pin: '',
    };
  }

  function defaultRuntime() {
    return { deck: [], player: 1, stats: { spins: 0, big: 0, medium: 0, small: 0, lose: 0 }, history: [], rotation: 0 };
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && raw.config && Array.isArray(raw.config.prizes) && raw.config.prizes.length >= MIN_PRIZES) {
        return {
          config: Object.assign(defaultConfig(), raw.config),
          runtime: Object.assign(defaultRuntime(), raw.runtime || {}),
        };
      }
    } catch (_) { /* storage unavailable or corrupt: fall back to defaults */ }
    return { config: defaultConfig(), runtime: defaultRuntime() };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, runtime })); } catch (_) { /* ignore */ }
  }

  let { config, runtime } = load();

  // ===================================================================
  // Odds engine
  // ===================================================================
  function rand() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  const randInt = (n) => Math.floor(rand() * n);
  const pick = (arr) => arr[randInt(arr.length)];

  function oddsWithLose(odds) {
    const big = +odds.big || 0, medium = +odds.medium || 0, small = +odds.small || 0;
    return { big, medium, small, lose: Math.max(0, 100 - big - medium - small) };
  }

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  // Smallest deck that represents the odds exactly (e.g. 10/25/50/15 -> 20 cards).
  function deckSizeFor(odds) {
    const o = oddsWithLose(odds);
    const g = TIERS.reduce((acc, t) => (o[t] ? gcd(acc, o[t]) : acc), 100);
    return Math.round(100 / g);
  }

  function buildDeck() {
    const o = oddsWithLose(config.odds);
    const size = deckSizeFor(config.odds);
    const deck = [];
    TIERS.forEach((t) => { for (let i = 0; i < Math.round((o[t] * size) / 100); i++) deck.push(t); });
    return deck;
  }

  function drawTier() {
    if (config.mode === 'deck') {
      if (!runtime.deck.length) runtime.deck = buildDeck();
      return runtime.deck.splice(randInt(runtime.deck.length), 1)[0];
    }
    const o = oddsWithLose(config.odds);
    const r = rand() * 100;
    let acc = 0;
    for (const t of TIERS) { acc += o[t]; if (r < acc) return t; }
    return 'lose';
  }

  const inStock = (p) => p.tier === 'lose' || p.qty === null || p.qty === undefined || p.qty > 0;

  // Pick an in-stock slice for the tier; if that tier is sold out, step down a tier.
  function resolveSlice(tier) {
    let t = tier;
    while (t) {
      const options = segments.filter((p) => p.tier === t && inStock(p));
      if (options.length) return pick(options);
      t = DOWNGRADE[t];
    }
    const any = segments.filter(inStock);
    return any.length ? pick(any) : null;
  }

  // ===================================================================
  // Wheel layout: interleave tiers so similar slices are spread apart
  // ===================================================================
  let segments = [];

  function arrangeSegments() {
    const groups = TIERS.map((t) => config.prizes.filter((p) => p.tier === t)).filter((g) => g.length);
    groups.sort((a, b) => b.length - a.length);
    const out = [];
    const maxLen = groups.length ? groups[0].length : 0;
    for (let i = 0; i < maxLen; i++) groups.forEach((g) => { if (g[i]) out.push(g[i]); });
    segments = out;
    // Color each slice: cycle through its tier's palette so neighbours differ.
    const counters = {};
    segments.forEach((p) => {
      const pal = TIER_META[p.tier].palette;
      counters[p.tier] = (counters[p.tier] || 0);
      p._color = pal[counters[p.tier]++ % pal.length];
    });
  }

  // ===================================================================
  // DOM
  // ===================================================================
  const $ = (id) => document.getElementById(id);
  const stage = $('stage');
  const canvas = $('wheel');
  const ctx = canvas.getContext('2d');
  const spinBtn = $('spinBtn');
  const hubBtn = $('hubBtn');
  const pointer = $('pointer');

  function buildBulbs() {
    const wrap = $('bulbs');
    const n = 24;
    wrap.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const b = document.createElement('span');
      b.className = 'bulb';
      b.style.setProperty('--pos', `rotate(${(360 / n) * i}deg) translateY(-1967%)`);
      b.style.setProperty('--d', `${(-0.7 * (n - i)) / n}s`);
      wrap.appendChild(b);
    }
  }

  // ===================================================================
  // Wheel rendering
  // ===================================================================
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c : 255 - c) * amt)));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  function wrapText(text, maxWidth, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxWidth || !line) line = test;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) return null;
    return lines.every((l) => ctx.measureText(l).width <= maxWidth) ? lines : null;
  }

  function fitLabel(text, maxWidth, maxHeight, startSize, minSize) {
    for (let size = startSize; size >= minSize; size -= 1) {
      ctx.font = `600 ${size}px Fredoka, ui-rounded, system-ui, sans-serif`;
      const maxLines = Math.max(1, Math.min(2, Math.floor(maxHeight / (size * 1.08))));
      const lines = wrapText(text, maxWidth, maxLines);
      if (lines) return { size, lines };
    }
    // Last resort: ellipsize at the minimum size.
    ctx.font = `600 ${minSize}px Fredoka, ui-rounded, system-ui, sans-serif`;
    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
    return { size: minSize, lines: [`${t}…`] };
  }

  function renderWheel(highlight = -1, glow = 0) {
    const size = canvas.clientWidth;
    if (!size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const px = Math.round(size * dpr);
    if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const c = size / 2;
    const R = c;
    const n = segments.length;
    const a = (Math.PI * 2) / n;

    segments.forEach((p, i) => {
      const start = -Math.PI / 2 + i * a;
      const end = start + a;
      const out = !inStock(p);
      const base = out ? '#5b5f73' : p._color;
      const g = ctx.createRadialGradient(c, c, R * 0.15, c, c, R);
      g.addColorStop(0, shade(base, 0.25));
      g.addColorStop(0.7, base);
      g.addColorStop(1, shade(base, -0.22));
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, R, start, end);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();

      if (p.tier === 'big' && !out) {
        // Sparkle stripe for the jackpot slice.
        ctx.save();
        ctx.clip();
        const s = ctx.createLinearGradient(c + Math.cos(start) * R, c + Math.sin(start) * R, c + Math.cos(end) * R, c + Math.sin(end) * R);
        s.addColorStop(0, 'rgba(255,255,255,0)');
        s.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        s.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = s;
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
      }

      if (i === highlight && glow > 0) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, R, start, end);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,255,255,${0.45 * glow})`;
        ctx.fill();
      }
    });

    // Dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, R * 0.012);
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + i * a;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.lineTo(c + Math.cos(ang) * R, c + Math.sin(ang) * R);
      ctx.stroke();
    }

    // Pegs at each divider, near the edge
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + i * a;
      const x = c + Math.cos(ang) * R * 0.955, y = c + Math.sin(ang) * R * 0.955;
      const pg = ctx.createRadialGradient(x - R * 0.006, y - R * 0.006, 0, x, y, R * 0.022);
      pg.addColorStop(0, '#ffffff');
      pg.addColorStop(1, '#c9c9d6');
      ctx.beginPath();
      ctx.arc(x, y, R * 0.02, 0, Math.PI * 2);
      ctx.fillStyle = pg;
      ctx.fill();
    }

    // Labels: read from the hub outward, emoji at the rim
    segments.forEach((p, i) => {
      const mid = -Math.PI / 2 + (i + 0.5) * a;
      const out = !inStock(p);
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(mid);

      const emojiR = R * 0.80;
      const emojiSize = Math.min(R * 0.13, 2 * emojiR * Math.sin(a / 2) * 0.62);
      ctx.font = `${emojiSize}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(emojiR, 0);
      ctx.rotate(Math.PI / 2);
      if (out) ctx.globalAlpha = 0.45;
      ctx.fillText(p.emoji || '🎉', 0, 0);
      ctx.restore();

      const inner = R * 0.25, outer = emojiR - emojiSize * 1.0;
      const textR = (inner + outer) / 2;
      const maxH = 2 * inner * Math.sin(a / 2) * 1.6;
      const label = out ? `${p.name} (OUT)` : p.name;
      const fit = fitLabel(label, outer - inner, Math.min(maxH, 2 * textR * Math.sin(a / 2) * 0.85), Math.round(R * 0.075), Math.max(9, Math.round(R * 0.038)));
      ctx.font = `600 ${fit.size}px Fredoka, ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillStyle = out ? 'rgba(255,255,255,0.6)' : TIER_META[p.tier].text;
      ctx.shadowColor = p.tier === 'big' ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 1;
      const lh = fit.size * 1.08;
      fit.lines.forEach((line, li) => {
        ctx.fillText(line, outer, (li - (fit.lines.length - 1) / 2) * lh);
      });
      ctx.restore();
    });

    // Inner shading + hub well
    const ring = ctx.createRadialGradient(c, c, R * 0.85, c, c, R);
    ring.addColorStop(0, 'rgba(0,0,0,0)');
    ring.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = ring;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(c, c, R * 0.27, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();
  }

  // ===================================================================
  // Sound (synthesised, no files needed)
  // ===================================================================
  const Sound = {
    ac: null,
    ensure() {
      if (!this.ac) { try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; } }
      if (this.ac.state === 'suspended') this.ac.resume();
      return this.ac;
    },
    tone(freq, start, dur, type = 'sine', vol = 0.2, slideTo = null) {
      const ac = this.ac;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, start);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(ac.destination);
      o.start(start); o.stop(start + dur + 0.02);
    },
    tick() {
      if (!config.sound || !this.ensure()) return;
      this.tone(2200 + rand() * 300, this.ac.currentTime, 0.035, 'square', 0.05);
    },
    win(tier) {
      if (!config.sound || !this.ensure()) return;
      const t = this.ac.currentTime;
      const seq = tier === 'big'
        ? [523, 659, 784, 1047, 784, 1047, 1319, 1568]
        : tier === 'medium' ? [523, 659, 784, 1047, 1319] : [659, 784, 1047];
      seq.forEach((f, i) => {
        this.tone(f, t + i * 0.11, 0.28, 'triangle', 0.22);
        this.tone(f * 2, t + i * 0.11, 0.18, 'sine', 0.05);
      });
      if (tier === 'big') {
        [1047, 1319, 1568].forEach((f) => this.tone(f, t + seq.length * 0.11, 1.1, 'triangle', 0.14));
      }
    },
    lose() {
      if (!config.sound || !this.ensure()) return;
      const t = this.ac.currentTime;
      this.tone(392, t, 0.35, 'triangle', 0.18, 370);
      this.tone(370, t + 0.38, 0.35, 'triangle', 0.18, 349);
      this.tone(349, t + 0.76, 0.8, 'triangle', 0.18, 311);
    },
  };

  // ===================================================================
  // Confetti & fireworks
  // ===================================================================
  const Confetti = (() => {
    const cv = $('confetti');
    const cx = cv.getContext('2d');
    const colors = ['#ffd23f', '#ff4f8b', '#7c5cff', '#12c2a4', '#22a7f0', '#ffffff', '#ff8a5b'];
    let parts = [];
    let running = false;
    let w = 0, h = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function add(x, y, count, { spread = Math.PI * 2, angle = -Math.PI / 2, power = 12, sparkle = false } = {}) {
      for (let i = 0; i < count; i++) {
        const ang = angle + (rand() - 0.5) * spread;
        const v = power * (0.45 + rand() * 0.75);
        parts.push({
          x, y,
          vx: Math.cos(ang) * v, vy: Math.sin(ang) * v,
          size: sparkle ? 2 + rand() * 2.5 : 6 + rand() * 8,
          color: pick(colors),
          rot: rand() * Math.PI, vr: (rand() - 0.5) * 0.4,
          shape: sparkle ? 'dot' : (rand() < 0.3 ? 'circle' : 'rect'),
          life: 0, max: sparkle ? 55 + rand() * 30 : 160 + rand() * 80,
          drag: sparkle ? 0.95 : 0.985,
          g: sparkle ? 0.08 : 0.22,
        });
      }
      if (!running) { running = true; requestAnimationFrame(frame); }
    }

    function frame() {
      cx.clearRect(0, 0, w, h);
      parts = parts.filter((p) => p.life < p.max && p.y < h + 40);
      for (const p of parts) {
        p.life++;
        p.vx *= p.drag; p.vy = p.vy * p.drag + p.g;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        const fade = Math.min(1, (p.max - p.life) / 30);
        cx.globalAlpha = fade;
        cx.fillStyle = p.color;
        if (p.shape === 'dot') {
          cx.shadowColor = p.color; cx.shadowBlur = 8;
          cx.beginPath(); cx.arc(p.x, p.y, p.size, 0, Math.PI * 2); cx.fill();
          cx.shadowBlur = 0;
        } else if (p.shape === 'circle') {
          cx.beginPath(); cx.arc(p.x, p.y, p.size / 2.4, 0, Math.PI * 2); cx.fill();
        } else {
          cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot);
          cx.scale(1, Math.cos(p.life * 0.15 + p.rot));
          cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          cx.restore();
        }
      }
      cx.globalAlpha = 1;
      if (parts.length) requestAnimationFrame(frame);
      else { running = false; cx.clearRect(0, 0, w, h); }
    }

    function celebrate(tier) {
      if (tier === 'small') {
        add(w * 0.5, h * 0.55, 90, { spread: 1.4, power: 17 });
      } else if (tier === 'medium') {
        add(w * 0.2, h, 110, { angle: -Math.PI / 2 + 0.35, spread: 0.7, power: 24 });
        add(w * 0.8, h, 110, { angle: -Math.PI / 2 - 0.35, spread: 0.7, power: 24 });
      } else if (tier === 'big') {
        add(0, h * 0.9, 160, { angle: -Math.PI / 3, spread: 0.6, power: 28 });
        add(w, h * 0.9, 160, { angle: (-2 * Math.PI) / 3, spread: 0.6, power: 28 });
        for (let i = 0; i < 9; i++) {
          setTimeout(() => {
            const x = w * (0.15 + rand() * 0.7), y = h * (0.12 + rand() * 0.35);
            add(x, y, 70, { power: 9, sparkle: true });
            add(x, y, 25, { power: 7 });
            if (config.sound && Sound.ensure()) Sound.tone(180 + rand() * 80, Sound.ac.currentTime, 0.25, 'sawtooth', 0.04, 60);
          }, 300 + i * 380);
        }
        setTimeout(() => add(w * 0.5, -10, 220, { angle: Math.PI / 2, spread: Math.PI, power: 6 }), 900);
      }
    }

    window.addEventListener('resize', resize);
    resize();
    return { celebrate };
  })();

  // ===================================================================
  // Spin animation
  // ===================================================================
  let rotation = runtime.rotation || 0; // degrees, clockwise
  let spinning = false;
  let roundLocked = false;
  let lastTickIndex = null;
  let lastTickTime = 0;

  const mod = (x, m) => ((x % m) + m) % m;
  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
  const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

  function applyRotation() {
    canvas.style.transform = `rotate(${rotation}deg)`;
    const segA = 360 / segments.length;
    const idx = Math.floor(mod(-rotation, 360) / segA);
    if (lastTickIndex !== null && idx !== lastTickIndex) {
      const now = performance.now();
      if (now - lastTickTime > 28) { Sound.tick(); flickPointer(); lastTickTime = now; }
    }
    lastTickIndex = idx;
  }

  function flickPointer() {
    if (!pointer.animate) return;
    pointer.animate(
      [{ transform: 'translateX(-50%) rotate(0deg)' }, { transform: 'translateX(-50%) rotate(-24deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }],
      { duration: 140, easing: 'ease-out' }
    );
  }

  function tween(from, to, duration, ease) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / duration);
        rotation = from + (to - from) * ease(t);
        applyRotation();
        if (t < 1) requestAnimationFrame(step); else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function pulseSlice(idx) {
    return new Promise((resolve) => {
      const t0 = performance.now(), dur = 1100;
      function step(now) {
        const t = Math.min(1, (now - t0) / dur);
        renderWheel(idx, Math.abs(Math.sin(t * Math.PI * 3)));
        if (t < 1) requestAnimationFrame(step); else { renderWheel(idx, 0.35); resolve(); }
      }
      requestAnimationFrame(step);
    });
  }

  function setControls() {
    const busy = spinning || roundLocked;
    spinBtn.disabled = busy;
    hubBtn.disabled = busy;
    spinBtn.querySelector('.spin-label').textContent = spinning ? 'Spinning…' : 'SPIN';
    $('hint').textContent = spinning ? 'Good luck!' : busy ? '' : 'Tap the button or the wheel';
  }

  async function spin() {
    if (spinning || roundLocked) return;
    if (!segments.some(inStock)) { toast('All prizes are out of stock. Restock in Settings.'); return; }
    Sound.ensure();
    requestWakeLock();

    const tier = drawTier();
    const slice = resolveSlice(tier);
    if (!slice) return;
    const idx = segments.indexOf(slice);

    spinning = true;
    roundLocked = true;
    setControls();
    stage.dataset.state = 'spinning';

    // Land inside the slice (not on a divider), with a small overshoot then settle back.
    const segA = 360 / segments.length;
    const jitter = (rand() - 0.5) * segA * 0.6;
    const targetMod = mod(-((idx + 0.5) * segA + jitter), 360);
    const turns = 6 + randInt(3);
    const start = rotation;
    const final = start + turns * 360 + mod(targetMod - mod(start, 360), 360);
    const overshoot = segA * 0.1;

    await tween(start, start - 14, 380, easeInOutSine);                    // wind-up
    await tween(start - 14, final + overshoot, 6200 + rand() * 1200, easeOutQuart); // main spin
    await tween(final + overshoot, final, 520, easeInOutSine);              // settle
    rotation = mod(final, 360);
    applyRotation();

    // Record result
    const won = slice.tier;
    runtime.stats.spins++;
    runtime.stats[won]++;
    if (won !== 'lose' && typeof slice.qty === 'number') slice.qty = Math.max(0, slice.qty - 1);
    runtime.history.unshift({ player: runtime.player, emoji: slice.emoji, name: slice.name, tier: won });
    runtime.history = runtime.history.slice(0, 30);
    runtime.rotation = rotation;
    save();

    stage.dataset.state = won === 'lose' ? 'lose' : 'win';
    if (won !== 'lose') { Sound.win(won); Confetti.celebrate(won); }
    else Sound.lose();
    if (won === 'big') { const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }

    await pulseSlice(idx);
    spinning = false;
    setControls();
    showResult(slice);
    renderRecent();
  }

  // ===================================================================
  // Result modal & rounds
  // ===================================================================
  function showResult(slice) {
    const card = $('resultCard');
    card.className = `result-card ${slice.tier}`;
    $('resultTier').textContent = TIER_META[slice.tier].label;
    $('resultEmoji').textContent = slice.emoji || '🎉';
    const prize = $('resultPrize');
    prize.textContent = '';
    if (slice.tier === 'lose') {
      $('resultHeadline').textContent = slice.name;
      prize.textContent = pick(LOSE_LINES);
    } else {
      $('resultHeadline').textContent = pick(WIN_HEADLINES[slice.tier]);
      prize.append('You won: ');
      const b = document.createElement('b');
      b.textContent = slice.name;
      prize.append(b);
    }
    // Restart CSS animations on re-open
    const modal = $('resultModal');
    modal.hidden = true; void modal.offsetWidth; modal.hidden = false;
    setTimeout(() => $('nextBtn').focus({ preventScroll: true }), 50);
  }

  function nextPlayer() {
    $('resultModal').hidden = true;
    runtime.player++;
    roundLocked = false;
    stage.dataset.state = 'idle';
    save();
    renderWheel();
    renderPlayer(true);
    setControls();
  }

  function renderPlayer(bump) {
    const el = $('playerBadge');
    el.textContent = `Player #${runtime.player}`;
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  }

  function renderRecent() {
    const ul = $('recent');
    ul.innerHTML = '';
    runtime.history.slice(0, 6).forEach((h) => {
      const li = document.createElement('li');
      li.className = `chip ${h.tier}`;
      li.textContent = `${h.emoji} ${h.name}`;
      li.title = `Player #${h.player}`;
      ul.appendChild(li);
    });
  }

  function renderHeader() {
    $('title').textContent = config.title || 'Spin to Win!';
    $('subtitle').textContent = config.subtitle || '';
    $('subtitle').hidden = !config.subtitle;
    document.title = config.title || 'Prize Spinner';
    $('soundBtn').textContent = config.sound ? '🔊' : '🔇';
  }

  // ===================================================================
  // Settings drawer
  // ===================================================================
  let draft = null;

  function openSettings() {
    if (spinning) return;
    if (config.pin) { openPin(); return; }
    showDrawer();
  }

  function openPin() {
    $('pinError').textContent = '';
    $('pinInput').value = '';
    $('pinModal').hidden = false;
    setTimeout(() => $('pinInput').focus(), 50);
  }

  function showDrawer() {
    draft = JSON.parse(JSON.stringify(config));
    $('setTitle').value = draft.title;
    $('setSubtitle').value = draft.subtitle;
    $('oddsBig').value = draft.odds.big;
    $('oddsMedium').value = draft.odds.medium;
    $('oddsSmall').value = draft.odds.small;
    document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === draft.mode; });
    $('setSound').checked = !!draft.sound;
    $('setPin').value = draft.pin || '';
    $('settingsError').textContent = '';
    renderPrizeRows();
    updateOddsOutput();
    renderStats();
    $('drawer').classList.add('open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }

  function closeDrawer() {
    $('drawer').classList.remove('open');
    $('drawer').setAttribute('aria-hidden', 'true');
    draft = null;
  }

  function renderPrizeRows() {
    const wrap = $('prizeRows');
    wrap.innerHTML = '';
    draft.prizes.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'prize-row';

      const emoji = document.createElement('input');
      emoji.className = 'emoji-in';
      emoji.value = p.emoji;
      emoji.maxLength = 8;
      emoji.setAttribute('aria-label', 'Icon');
      emoji.addEventListener('input', () => { p.emoji = emoji.value.trim(); });

      const name = document.createElement('input');
      name.className = 'name-in';
      name.value = p.name;
      name.maxLength = 32;
      name.placeholder = 'Prize name';
      name.setAttribute('aria-label', 'Prize name');
      name.addEventListener('input', () => { p.name = name.value; name.classList.remove('invalid'); });

      const tier = document.createElement('select');
      tier.className = 'tier-sel';
      tier.setAttribute('aria-label', 'Tier');
      TIERS.forEach((t) => {
        const o = document.createElement('option');
        o.value = t; o.textContent = TIER_NAMES[t];
        tier.appendChild(o);
      });
      tier.value = p.tier;
      tier.dataset.tier = p.tier;
      const qty = document.createElement('input');
      qty.className = 'qty-in';
      qty.type = 'number'; qty.min = '0'; qty.inputMode = 'numeric';
      qty.placeholder = '∞';
      qty.setAttribute('aria-label', 'Stock');
      qty.value = p.qty === null || p.qty === undefined ? '' : p.qty;
      qty.disabled = p.tier === 'lose';
      qty.addEventListener('input', () => {
        const v = qty.value.trim();
        p.qty = v === '' ? null : Math.max(0, Math.floor(+v) || 0);
      });
      tier.addEventListener('change', () => {
        p.tier = tier.value; tier.dataset.tier = p.tier;
        qty.disabled = p.tier === 'lose';
        if (p.tier === 'lose') { p.qty = null; qty.value = ''; }
      });

      const del = document.createElement('button');
      del.className = 'del-btn';
      del.type = 'button';
      del.textContent = '🗑';
      del.setAttribute('aria-label', `Remove ${p.name}`);
      del.addEventListener('click', () => {
        if (draft.prizes.length <= MIN_PRIZES) { $('settingsError').textContent = `The wheel needs at least ${MIN_PRIZES} slices.`; return; }
        draft.prizes.splice(i, 1);
        renderPrizeRows();
      });

      row.append(emoji, name, tier, qty, del);
      wrap.appendChild(row);
    });
    $('addPrize').disabled = draft.prizes.length >= MAX_PRIZES;
  }

  function readOdds() {
    const v = (id) => { const n = Math.floor(+$(id).value); return Number.isFinite(n) ? n : 0; };
    return { big: v('oddsBig'), medium: v('oddsMedium'), small: v('oddsSmall') };
  }

  function updateOddsOutput() {
    const o = readOdds();
    const sum = o.big + o.medium + o.small;
    const out = $('oddsLose');
    out.textContent = sum > 100 ? `Over by ${sum - 100}%` : `${100 - sum}%`;
    out.classList.toggle('bad', sum > 100);
    $('deckSize').textContent = sum <= 100 ? deckSizeFor(o) : '?';
  }

  function renderStats() {
    const s = runtime.stats;
    const pct = (n) => (s.spins ? `${Math.round((n / s.spins) * 100)}% of spins` : '–');
    const items = [
      ['Spins', s.spins, `Next: Player #${runtime.player}`],
      ['🏆 Big', s.big, pct(s.big)],
      ['🎁 Medium', s.medium, pct(s.medium)],
      ['🍬 Small', s.small, pct(s.small)],
      ['🍀 No prize', s.lose, pct(s.lose)],
    ];
    if (config.mode === 'deck') {
      const left = runtime.deck.length || deckSizeFor(config.odds);
      items.push(['Deck', left, 'spins left in this cycle']);
    }
    const wrap = $('stats');
    wrap.innerHTML = '';
    items.forEach(([k, v, sub]) => {
      const d = document.createElement('div');
      d.className = 'stat';
      const kk = document.createElement('div'); kk.className = 'k'; kk.textContent = k;
      const vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
      const ss = document.createElement('div'); ss.className = 's'; ss.textContent = sub;
      d.append(kk, vv, ss);
      wrap.appendChild(d);
    });
  }

  function saveSettings() {
    const err = $('settingsError');
    err.textContent = '';
    draft.title = $('setTitle').value.trim();
    draft.subtitle = $('setSubtitle').value.trim();
    draft.sound = $('setSound').checked;
    draft.pin = $('setPin').value.trim();
    draft.mode = (document.querySelector('input[name="mode"]:checked') || {}).value || 'deck';

    const odds = readOdds();
    if ([odds.big, odds.medium, odds.small].some((x) => x < 0 || x > 100)) { err.textContent = 'Each percentage must be between 0 and 100.'; return; }
    if (odds.big + odds.medium + odds.small > 100) { err.textContent = 'Big + Medium + Small cannot exceed 100%.'; return; }

    let bad = false;
    document.querySelectorAll('#prizeRows .name-in').forEach((el, i) => {
      draft.prizes[i].name = draft.prizes[i].name.trim();
      if (!draft.prizes[i].name) { el.classList.add('invalid'); bad = true; }
    });
    if (bad) { err.textContent = 'Every prize needs a name.'; return; }
    if (draft.prizes.length < MIN_PRIZES) { err.textContent = `The wheel needs at least ${MIN_PRIZES} slices.`; return; }

    const missing = ['big', 'medium', 'small'].filter((t) => odds[t] > 0 && !draft.prizes.some((p) => p.tier === t));
    if (100 - odds.big - odds.medium - odds.small > 0 && !draft.prizes.some((p) => p.tier === 'lose')) missing.push('lose');

    const oddsChanged = JSON.stringify(odds) !== JSON.stringify(config.odds) || draft.mode !== config.mode;
    draft.odds = odds;
    draft.prizes.forEach((p) => { delete p._color; });
    config = draft;
    if (oddsChanged) runtime.deck = [];
    arrangeSegments();
    save();
    renderHeader();
    renderWheel();
    applyRotation();
    closeDrawer();
    toast(missing.length
      ? `Saved. Note: no slices for ${missing.map((t) => TIER_NAMES[t]).join(', ')}, so those spins fall to the next tier down.`
      : 'Settings saved');
  }

  // ===================================================================
  // Misc helpers
  // ===================================================================
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  let wakeLock = null;
  async function requestWakeLock() {
    try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch (_) { /* not supported */ }
  }

  function toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement && !d.webkitFullscreenElement) {
      const el = d.documentElement;
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
    } else {
      (d.exitFullscreen || d.webkitExitFullscreen || (() => {})).call(d);
    }
  }

  // ===================================================================
  // Events
  // ===================================================================
  spinBtn.addEventListener('click', spin);
  hubBtn.addEventListener('click', spin);
  $('nextBtn').addEventListener('click', nextPlayer);
  $('settingsBtn').addEventListener('click', openSettings);
  $('fullscreenBtn').addEventListener('click', toggleFullscreen);
  $('soundBtn').addEventListener('click', () => {
    config.sound = !config.sound;
    save(); renderHeader();
    if (config.sound) { Sound.ensure(); Sound.tick(); }
  });

  $('drawerClose').addEventListener('click', closeDrawer);
  $('drawerScrim').addEventListener('click', closeDrawer);
  $('cancelSettings').addEventListener('click', closeDrawer);
  $('saveSettings').addEventListener('click', saveSettings);
  ['oddsBig', 'oddsMedium', 'oddsSmall'].forEach((id) => $(id).addEventListener('input', updateOddsOutput));
  $('addPrize').addEventListener('click', () => {
    if (draft.prizes.length >= MAX_PRIZES) return;
    draft.prizes.push({ id: uid(), emoji: '🎉', name: '', tier: 'small', qty: null });
    renderPrizeRows();
    const names = document.querySelectorAll('#prizeRows .name-in');
    names[names.length - 1].focus();
  });
  $('resetStats').addEventListener('click', () => {
    if (!confirm('Reset stats, recent spins, player count and the odds deck?')) return;
    const keepRot = runtime.rotation;
    runtime = defaultRuntime();
    runtime.rotation = keepRot;
    save(); renderStats(); renderRecent(); renderPlayer(false);
    toast('Stats reset');
  });
  $('resetAll').addEventListener('click', () => {
    if (!confirm('Restore the default prizes, odds and settings? This also clears stats.')) return;
    config = defaultConfig();
    runtime = defaultRuntime();
    rotation = 0;
    arrangeSegments(); save();
    renderHeader(); renderWheel(); applyRotation(); renderRecent(); renderPlayer(false);
    closeDrawer();
    toast('Defaults restored');
  });

  $('pinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('pinInput').value === config.pin) { $('pinModal').hidden = true; showDrawer(); }
    else {
      $('pinError').textContent = 'Incorrect PIN';
      const card = $('pinForm');
      card.animate?.([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 250, iterations: 2 });
    }
  });
  $('pinCancel').addEventListener('click', () => { $('pinModal').hidden = true; });

  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea'].includes(tag)) return;
    if ($('drawer').classList.contains('open') || !$('pinModal').hidden) {
      if (e.key === 'Escape') { closeDrawer(); $('pinModal').hidden = true; }
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!$('resultModal').hidden) nextPlayer();
      else spin();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock === null && runtime.stats.spins) requestWakeLock();
  });

  let resizeRaf;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => renderWheel());
  });

  // ===================================================================
  // Boot
  // ===================================================================
  arrangeSegments();
  buildBulbs();
  renderHeader();
  renderPlayer(false);
  renderRecent();
  renderWheel();
  applyRotation();
  setControls();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderWheel());

  // Exposed for testing / staff troubleshooting in the console.
  window.PrizeSpinner = { buildDeck, deckSizeFor, drawTier: () => drawTier(), get config() { return config; }, get runtime() { return runtime; } };
})();
