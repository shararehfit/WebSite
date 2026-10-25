#!/usr/bin/env node
/* ==========================================================================
   Fitnex site builder
   Generates the German (/) and English (/en/) pages from one set of templates
   and two translation files. Uses only Node's built-in modules, no npm packages.

     node build.js        build into dist/
   ==========================================================================

   Template syntax (src/templates/*.html, src/content/<lang>/*.html):
     {{ key.path }}       text, HTML-escaped           (use for almost everything)
     {{{ key.path }}}     raw HTML, inserted as-is      (only for texts with <strong>, links, …)
     {{ json key.path }}  value as JSON                 (inside <script> blocks)
   A missing key stops the build, so a typo never ships as an empty spot.
*/
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://fitnex.at';

// Each language: where it lives and what its pages are called.
const LANGS = {
  de: { dir: '', base: '', ogLocale: 'de_AT', pages: { index: 'index.html', privacy: 'datenschutz.html' } },
  en: { dir: 'en/', base: '../', ogLocale: 'en_GB', pages: { index: 'index.html', privacy: 'privacy.html' } },
};
const DEFAULT_LANG = 'de';

/* ---------- helpers ---------- */

const read = file => fs.readFileSync(file, 'utf8');
const readJson = file => {
  try { return JSON.parse(read(file)); }
  catch (e) { throw new Error(`${path.relative(ROOT, file)}: invalid JSON (${e.message})`); }
};

const escapeHtml = value => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// JSON for <script> blocks; "</" is escaped so the text can never close the script tag.
const toJson = value => JSON.stringify(value).replace(/<\//g, '<\\/');

const lookup = (data, keyPath, where) => {
  const value = keyPath.split('.').reduce((obj, k) => (obj == null ? undefined : obj[k]), data);
  if (value === undefined) throw new Error(`${where}: missing key "${keyPath}"`);
  return value;
};

const render = (template, data, where) => template
  .replace(/\{\{\{\s*([\w.@-]+)\s*\}\}\}/g, (_, key) => String(lookup(data, key, where)))
  .replace(/\{\{\s*json\s+([\w.@-]+)\s*\}\}/g, (_, key) => toJson(lookup(data, key, where)))
  .replace(/\{\{\s*([\w.@-]+)\s*\}\}/g, (_, key) => escapeHtml(lookup(data, key, where)));

// Every key in one language file must exist in the other, so neither page has gaps.
const flatKeys = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) =>
  v && typeof v === 'object' ? flatKeys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

const checkParity = translations => {
  const [a, b] = Object.keys(translations);
  const ka = new Set(flatKeys(translations[a])), kb = new Set(flatKeys(translations[b]));
  const onlyA = [...ka].filter(k => !kb.has(k)), onlyB = [...kb].filter(k => !ka.has(k));
  if (onlyA.length || onlyB.length) {
    throw new Error([
      'Translation files do not match:',
      ...onlyA.map(k => `  only in ${a}.json: ${k}`),
      ...onlyB.map(k => `  only in ${b}.json: ${k}`),
    ].join('\n'));
  }
};

const copyDir = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name), dest = path.join(to, entry.name);
    entry.isDirectory() ? copyDir(src, dest) : fs.copyFileSync(src, dest);
  }
};

const write = (rel, content) => {
  const file = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

/* ---------- build ---------- */

function build() {
  const started = Date.now();
  const translations = Object.fromEntries(Object.keys(LANGS).map(l => [l, readJson(path.join(SRC, 'i18n', `${l}.json`))]));
  checkParity(translations);

  fs.rmSync(DIST, { recursive: true, force: true });
  copyDir(PUBLIC, DIST);

  const pageNames = Object.keys(LANGS[DEFAULT_LANG].pages);
  const urlOf = (lang, page) => {
    const file = LANGS[lang].pages[page];
    return `${SITE}/${LANGS[lang].dir}${file === 'index.html' ? '' : file}`;
  };
  // relative link from one language's folder to a page in another (or the same) language
  const hrefFrom = (fromLang, toLang, page) => {
    const file = LANGS[toLang].pages[page];
    if (fromLang === toLang) return file === 'index.html' ? './' : file;
    return `${LANGS[fromLang].base}${LANGS[toLang].dir}${file === 'index.html' ? '' : file}` || './';
  };

  const written = [];
  for (const [lang, cfg] of Object.entries(LANGS)) {
    const other = Object.keys(LANGS).find(l => l !== lang);
    for (const page of pageNames) {
      const data = {
        ...translations[lang],
        page: {
          lang,
          base: cfg.base,
          ogLocale: cfg.ogLocale,
          ogLocaleAlt: LANGS[other].ogLocale,
          url: urlOf(lang, page),
          urlDe: urlOf('de', page),
          urlEn: urlOf('en', page),
          urlDefault: urlOf(DEFAULT_LANG, page),
          homeHref: hrefFrom(lang, lang, 'index'),
          privacyHref: hrefFrom(lang, lang, 'privacy'),
          cardHref: `${cfg.base}card/`,
          altHref: hrefFrom(lang, other, page),
          altLang: other,
          // language switcher: link to each version of this page, and which one is current
          hrefDe: hrefFrom(lang, 'de', page),
          hrefEn: hrefFrom(lang, 'en', page),
          currentDe: lang === 'de' ? 'page' : 'false',
          currentEn: lang === 'en' ? 'page' : 'false',
          siteUrl: `${SITE}/`,
        },
      };
      // longer content (the privacy policy) lives in its own file per language
      const contentFile = path.join(SRC, 'content', lang, `${page}.html`);
      if (fs.existsSync(contentFile)) {
        data.content = render(read(contentFile), data, path.relative(ROOT, contentFile));
      }
      const templateFile = path.join(SRC, 'templates', `${page}.html`);
      const html = render(read(templateFile), data, `${path.relative(ROOT, templateFile)} [${lang}]`);
      const out = `${cfg.dir}${cfg.pages[page]}`;
      write(out, html);
      written.push(out);
    }
  }

  // The English privacy page used to live at /privacy.html; keep that old address working.
  write('privacy.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Privacy Policy | Fitnex</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${urlOf('en', 'privacy')}">
<meta http-equiv="refresh" content="0; url=en/privacy.html">
</head><body><p>This page has moved to <a href="en/privacy.html">${urlOf('en', 'privacy')}</a>.</p></body></html>
`);

  // Sitemap with language alternates, so Google links the German and English versions.
  const today = new Date().toISOString().slice(0, 10);
  const entries = [];
  for (const page of pageNames) {
    for (const lang of Object.keys(LANGS)) {
      const alternates = Object.keys(LANGS)
        .map(l => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlOf(l, page)}"/>`)
        .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(DEFAULT_LANG, page)}"/>`);
      entries.push(`  <url>
    <loc>${urlOf(lang, page)}</loc>
${alternates.join('\n')}
    <lastmod>${today}</lastmod>
    <changefreq>${page === 'index' ? 'monthly' : 'yearly'}</changefreq>
    <priority>${page === 'index' ? (lang === DEFAULT_LANG ? '1.0' : '0.9') : '0.3'}</priority>
  </url>`);
    }
  }
  entries.push(`  <url>
    <loc>${SITE}/card/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.6</priority>
  </url>`);
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`);

  console.log(`Built ${written.length} pages in ${Date.now() - started} ms:`);
  for (const f of [...written, 'privacy.html (redirect)', 'sitemap.xml']) console.log(`  dist/${f}`);
}

try {
  build();
} catch (err) {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exit(1);
}
