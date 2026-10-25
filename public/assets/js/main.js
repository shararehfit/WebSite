/* ==========================================================================
   Fitnex: page behaviour
   ========================================================================== */

(() => {
  'use strict';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  document.documentElement.classList.add('js');

  /* ---------- Loader: on first arrival only, for at least two seconds and until Poppins is in.
     Coming from another Fitnex page (language switch, privacy page) skips it; the check runs
     in the page head, which adds .skip-loader before anything is drawn. Nothing is stored. ---------- */
  const skipLoader = document.documentElement.classList.contains('skip-loader');
  const fontsReady = Promise.race([
    Promise.all([
      document.fonts.load('700 100px Poppins'),
      document.fonts.load('400 16px Poppins'),
    ]).catch(() => {}),
    wait(2500),
  ]);

  Promise.all([wait(skipLoader ? 0 : 2000), fontsReady]).then(() => {
    const loader = document.getElementById('loader');
    if (loader) {
      loader.classList.add('is-done');
      if (skipLoader) loader.remove();
      else loader.addEventListener('transitionend', () => loader.remove(), { once: true });
    }
    document.body.classList.remove('is-loading');
    startHero();
  });

  /* ---------- Page texts: the build writes them into <script id="i18n"> per language ---------- */
  const T = JSON.parse(document.getElementById('i18n')?.textContent || '{}');

  /* ---------- Hero: vapour text in the left column, drifting across the hero ---------- */
  const PHRASES = T.phrases || ['Fitnex'];

  function startHero() {
    const canvas = document.getElementById('vapour');
    const slot = document.getElementById('vapour-slot');
    const live = document.getElementById('phrase-now');

    const vt = VapourText(canvas, {
      phrases: PHRASES,
      color: '#FFFFFF',
      vapour: '#4B3BC4',
      family: 'Poppins, sans-serif',
      weight: 700,
      firstStretch: 'normal',
      stretch: 'normal',
      align: 'left',
      area: () => {
        const c = canvas.getBoundingClientRect(), s = slot.getBoundingClientRect();
        return { x: s.left - c.left, y: s.top - c.top, width: s.width, height: s.height };
      },
      onPhrase: i => { live.textContent = PHRASES[i]; },
    });
    reduce ? vt.still() : vt.start();
  }

  /* ---------- Nav state, scroll progress and hero parallax ---------- */
  const nav = document.querySelector('.nav');
  const bar = document.querySelector('.progress span');
  const heroArt = document.querySelector('.hero-art');
  const wide = matchMedia('(min-width: 901px)'); // parallax only where the art sits beside the text
  let ticking = false;
  const onScroll = () => {
    // header state changes immediately so it never trails the scroll
    const scrolled = scrollY > 24;
    if (scrolled !== nav.classList.contains('scrolled')) nav.classList.toggle('scrolled', scrolled);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
      if (reduce || !wide.matches) heroArt.style.transform = '';
      else if (y < innerHeight * 1.2) heroArt.style.transform = `translateY(${y * 0.18}px)`;
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu drawer ---------- */
  const drawer = document.getElementById('drawer');
  const toggle = document.querySelector('.menu-toggle');
  const behind = [nav, document.querySelector('main'), document.querySelector('footer')];
  const focusables = () => [...drawer.querySelectorAll('a[href], button')];
  const isOpen = () => document.body.classList.contains('menu-open');

  const openMenu = () => {
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    behind.forEach(n => n.inert = true);
    setTimeout(() => drawer.querySelector('.drawer-close').focus({ preventScroll: true }), 50);
  };
  const closeMenu = (returnFocus = true) => {
    if (!isOpen()) return;
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    behind.forEach(n => n.inert = false);
    if (returnFocus) toggle.focus({ preventScroll: true });
  };

  toggle.addEventListener('click', openMenu);
  document.body.addEventListener('click', e => {
    const t = e.target.closest('[data-close-menu]');
    if (t) closeMenu(!t.matches('a'));
  });
  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { closeMenu(); return; }
    if (e.key === 'Tab') {
      const f = focusables(), first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) closeMenu(false); });

  /* ---------- Language switch keeps your place: #faq in German opens #faq in English ---------- */
  document.querySelectorAll('[data-lang-switch]').forEach(a => a.addEventListener('click', () => {
    if (location.hash && a.getAttribute('aria-current') !== 'page') a.hash = location.hash;
  }));

  /* ---------- Title and "Back to top" links scroll to the top ---------- */
  document.querySelectorAll('a[href="#top"]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    closeMenu(false);
    scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', location.pathname + location.search);
  }));

  /* ---------- Service links prefill the booking form ---------- */
  document.querySelectorAll('[data-goal]').forEach(a => a.addEventListener('click', () => {
    document.getElementById('f-goal').value = a.dataset.goal;
  }));

  /* ---------- Illustrations: inline the SVG files so they pick up the theme colours ---------- */
  document.querySelectorAll('[data-illo]').forEach(async box => {
    const src = box.dataset.illo;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(res.status);
      box.innerHTML = await res.text();
      box.querySelector('svg').setAttribute('aria-hidden', 'true');
    } catch {
      box.innerHTML = `<img src="${src}" alt="">`; // e.g. opened from disk: show it as a plain image
    }
  });

  /* ---------- Scroll motion: sections ease in as they arrive ---------- */
  const reveal = (sel, variant) => document.querySelectorAll(sel).forEach(n => {
    n.classList.add('reveal');
    if (variant) n.classList.add(variant);
    const sibs = [...n.parentElement.children].filter(c => c.matches(sel));
    n.style.setProperty('--d', `${Math.min(Math.max(sibs.indexOf(n), 0), 5) * 0.1}s`);
  });
  reveal('.section-head, .faq h2');
  reveal('.about-art', 'from-left');
  reveal('.intro > *', 'from-right');
  reveal('.service, .art, .quote', 'zoom');
  reveal('.steps li, details');
  reveal('.contact-card', 'zoom');

  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(n => io.observe(n));
  } else {
    document.querySelectorAll('.reveal').forEach(n => n.classList.add('is-in'));
  }

  /* ---------- Contact form: validates, then sends through Web3Forms ---------- */
  const form = document.getElementById('form');
  const submit = form.querySelector('[type="submit"]');
  const failure = form.querySelector('.form-error');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    failure.hidden = true;

    let ok = true;
    form.querySelectorAll('[required]').forEach(input => {
      const valid = input.checkValidity() && input.value.trim();
      input.closest('.field').classList.toggle('invalid', !valid);
      input.setAttribute('aria-invalid', !valid);
      if (!valid && ok) { input.focus(); ok = false; }
    });
    if (!ok) return;

    // a ticked spam trap means a bot: pretend it worked, send nothing
    if (form.botcheck.checked) { form.classList.add('done'); return; }

    const data = Object.fromEntries(new FormData(form));
    const interest = form.goal.options[form.goal.selectedIndex].text;
    data.goal = interest;                                   // readable label, not the internal value
    data.subject = `${T.subjectPrefix || "New message from the Fitnex website"}: ${interest}`;

    submit.disabled = true;
    submit.textContent = T.sending || 'Sending…';
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.message || res.status);
      form.classList.add('done');
      form.reset();
    } catch {
      failure.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = T.send || 'Send message';
    }
  });
})();
