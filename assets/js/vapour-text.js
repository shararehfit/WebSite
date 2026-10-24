/* ==========================================================================
   Vapour text
   Draws a phrase on a canvas, holds it, then sweeps left to right turning
   each pixel into a particle that drifts away and fades, before the next
   phrase condenses in. Plain canvas, no dependencies.
   ========================================================================== */

(function (global) {
  'use strict';

  const hexToRgb = hex => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const easeInOut = x => (x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function VapourText(canvas, options) {
    const o = Object.assign({
      phrases: ['Hello'],
      color: '#F4EFEC',          // solid text colour
      vapour: '#E6004C',         // colour particles drift toward
      family: 'Anybody, sans-serif',
      weight: 900,
      firstStretch: 'expanded',  // the name: wide
      stretch: 'condensed',      // the phrases: narrow
      fadeIn: 700,
      holdFirst: 2400,
      hold: 1800,
      sweep: 1100,
      vaporize: 2300,
      gap: 250,
      align: 'center',           // 'center' or 'left' within the text area
      area: null,                // () => {x, y, width, height} in CSS px, relative to the canvas
      onPhrase: null,
    }, options);

    const ctx = canvas.getContext('2d');
    const off = document.createElement('canvas');
    const offCtx = off.getContext('2d', { willReadFrequently: true });
    const vap = hexToRgb(o.vapour);

    let W = 0, H = 0, dpr = 1, img = null, u32 = null;
    let index = 0, phase = 'in', t = 0, last = 0, raf = 0, running = false, visible = true;
    let P = null; // particle store

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(r.width * dpr));
      H = Math.max(1, Math.round(r.height * dpr));
      canvas.width = off.width = W;
      canvas.height = off.height = H;
      img = ctx.createImageData(W, H);
      u32 = new Uint32Array(img.data.buffer);
      prepare();
    }

    // Render the phrase to the offscreen canvas, fitted to the space.
    function prepare() {
      const text = o.phrases[index];
      const first = index === 0;
      const font = size => `${first ? o.firstStretch : o.stretch} ${o.weight} ${size}px ${o.family}`;

      // The text lives in `area` (default: the whole canvas); vapour can drift anywhere.
      const r = o.area ? o.area() : null;
      const A = r
        ? { x: r.x * dpr, y: r.y * dpr, w: r.width * dpr, h: r.height * dpr }
        : { x: 0, y: 0, w: W, h: H };
      const left = o.align === 'left';

      offCtx.clearRect(0, 0, W, H);
      offCtx.font = font(100);
      const maxW = A.w * (left ? 1 : first ? .9 : .86);
      const maxH = A.h * (first ? .62 : .4);

      let lines = [text];
      let size = Math.min(maxH, (maxW / offCtx.measureText(text).width) * 100);

      // Long phrase on a narrow screen: break it onto two lines.
      if (!first && size < A.h * .2 && text.includes(' ')) {
        const words = text.split(' ');
        let best = null, bestSentence = null;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
          const w = Math.max(offCtx.measureText(a).width, offCtx.measureText(b).width);
          if (!best || w < best.w) best = { w, lines: [a, b] };
          // a break right after a full stop keeps whole sentences together
          if (/[.!?]$/.test(words[i - 1]) && (!bestSentence || w < bestSentence.w)) bestSentence = { w, lines: [a, b] };
        }
        if (bestSentence && bestSentence.w <= best.w * 1.4) best = bestSentence;
        lines = best.lines;
        size = Math.min(maxH / 2.1, (maxW / best.w) * 100);
      }

      offCtx.font = font(size);
      offCtx.fillStyle = o.color;
      offCtx.textAlign = left ? 'left' : 'center';
      offCtx.textBaseline = 'middle';
      const lh = size * 1.02;
      const x = left ? A.x : A.x + A.w / 2;
      const y0 = A.y + A.h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((line, i) => offCtx.fillText(line, x, y0 + i * lh));

      sample();
    }

    // Turn the rendered text into particles.
    function sample() {
      const data = offCtx.getImageData(0, 0, W, H).data;
      let step = Math.max(2, Math.round(dpr * 1.5));
      let count;
      // keep the particle count sane on very large screens
      for (;;) {
        count = 0;
        for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (data[(y * W + x) * 4 + 3] > 128) count++;
        if (count < 90000) break;
        step++;
      }
      const x = new Float32Array(count), y = new Float32Array(count);
      const vx = new Float32Array(count), vy = new Float32Array(count);
      const a = new Float32Array(count), decay = new Float32Array(count);
      const free = new Uint8Array(count);
      const rgb = new Uint8Array(count * 3);
      let minX = W, maxX = 0, i = 0;
      for (let py = 0; py < H; py += step) {
        for (let px = 0; px < W; px += step) {
          const k = (py * W + px) * 4;
          if (data[k + 3] > 128) {
            x[i] = px; y[i] = py; a[i] = 1;
            rgb[i * 3] = data[k]; rgb[i * 3 + 1] = data[k + 1]; rgb[i * 3 + 2] = data[k + 2];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            i++;
          }
        }
      }
      P = { count, x, y, vx, vy, a, decay, free, rgb, step, minX, maxX };
    }

    function drawSolid(alpha) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = alpha;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
    }

    function plot(px, py, s, r, g, b, alpha) {
      const A = (alpha * 255) | 0;
      if (A <= 0) return;
      const c = (A << 24) | (b << 16) | (g << 8) | r;
      const x0 = px | 0, y0 = py | 0;
      for (let yy = 0; yy < s; yy++) {
        const row = y0 + yy;
        if (row < 0 || row >= H) continue;
        const base = row * W;
        for (let xx = 0; xx < s; xx++) {
          const col = x0 + xx;
          if (col >= 0 && col < W) u32[base + col] = c;
        }
      }
    }

    function drawVapour(time, dt) {
      const p = P, k = dt / 16.67;
      const sweepX = p.minX - 20 + (p.maxX - p.minX + 60) * easeInOut(Math.min(time / o.sweep, 1));
      u32.fill(0);
      const s = p.step, drift = dpr;
      for (let i = 0; i < p.count; i++) {
        const r0 = p.rgb[i * 3], g0 = p.rgb[i * 3 + 1], b0 = p.rgb[i * 3 + 2];
        if (!p.free[i]) {
          if (p.x[i] <= sweepX) {
            p.free[i] = 1;
            p.vx[i] = (.5 + Math.random() * 1.8) * drift;
            p.vy[i] = -(.15 + Math.random() * 1.3) * drift;
            p.decay[i] = .006 + Math.random() * .014;
          } else {
            plot(p.x[i], p.y[i], s, r0, g0, b0, 1);
            continue;
          }
        }
        if (p.a[i] <= 0) continue;
        // a little turbulence so it reads as vapour, not sparks
        p.vx[i] += (Math.random() - .5) * .22 * drift * k;
        p.vy[i] += ((Math.random() - .5) * .22 - .012) * drift * k;
        p.x[i] += p.vx[i] * k;
        p.y[i] += p.vy[i] * k;
        p.a[i] -= p.decay[i] * k;
        const m = Math.min(1, (1 - p.a[i]) * 1.8);
        plot(p.x[i], p.y[i], s,
          (r0 + (vap[0] - r0) * m) | 0, (g0 + (vap[1] - g0) * m) | 0, (b0 + (vap[2] - b0) * m) | 0,
          Math.max(0, p.a[i]));
      }
      ctx.putImageData(img, 0, 0);
    }

    function next() {
      index = (index + 1) % o.phrases.length;
      phase = 'in'; t = 0;
      prepare();
      o.onPhrase && o.onPhrase(index);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - (last || now), 50);
      last = now;
      if (!visible) return;
      t += dt;

      const hold = index === 0 ? o.holdFirst : o.hold;
      if (phase === 'in') {
        drawSolid(easeInOut(Math.min(t / o.fadeIn, 1)));
        if (t >= o.fadeIn) { phase = 'hold'; t = 0; }
      } else if (phase === 'hold') {
        if (t < dt * 2) drawSolid(1);
        if (t >= hold) { phase = 'vapour'; t = 0; }
      } else if (phase === 'vapour') {
        drawVapour(t, dt);
        if (t >= o.vaporize) { phase = 'gap'; t = 0; ctx.clearRect(0, 0, W, H); }
      } else if (t >= o.gap) {
        next();
      }
    }

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resize(); if (phase !== 'in') { phase = 'hold'; t = 0; drawSolid(1); } }, 150);
    };

    return {
      start() {
        if (running) return;
        running = true;
        resize();
        o.onPhrase && o.onPhrase(index);
        global.addEventListener('resize', onResize);
        if ('IntersectionObserver' in global) {
          new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);
        }
        document.addEventListener('visibilitychange', () => { last = 0; });
        raf = requestAnimationFrame(frame);
      },
      // Reduced motion: show the first phrase and stay still.
      still() {
        resize();
        drawSolid(1);
        o.onPhrase && o.onPhrase(0);
        global.addEventListener('resize', () => { resize(); drawSolid(1); });
      },
      stop() { cancelAnimationFrame(raf); running = false; },
    };
  }

  global.VapourText = VapourText;
})(window);
