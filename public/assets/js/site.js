/* ==========================================================================
   Fitnex: small helpers loaded on every page
   ========================================================================== */

/* The footer year stays current without editing the page. */
document.querySelectorAll('[data-year]').forEach(n => { n.textContent = new Date().getFullYear(); });

/* Opened straight from disk (file://), a link to a folder like "en/" or "../" shows the
   folder's file list, because there is no web server to serve its index.html. Add the
   file name in that case only; online the links stay clean (fitnex.at/en/). */
if (location.protocol === 'file:') {
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (/^(\.{1,2}\/|[\w-]+\/)*$/.test(href) && href !== '') a.setAttribute('href', `${href}index.html`);
  });
}
