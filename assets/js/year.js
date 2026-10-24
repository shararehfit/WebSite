/* Fills every [data-year] element with the current year, so the footer never goes stale. */
document.querySelectorAll("[data-year]").forEach(n => { n.textContent = new Date().getFullYear(); });
