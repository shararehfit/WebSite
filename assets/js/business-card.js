/* ==========================================================================
   Fitnex: digital business card (QR code, Save contact, Share card)
   Adapted from the business-card script in the MyWebsPage project.
   ========================================================================== */

window.fitnexCard = (() => {
  'use strict';

  // vCard text values must escape backslashes, commas, semicolons and newlines.
  const esc = value => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
    .replace(/\r\n|\n/g, '\\n');

  const buildVCard = ({ fullName, org, title, emails = [], phones = [], links = [], note }) => {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:;${esc(fullName)};;;`, `FN:${esc(fullName)}`];
    if (org) lines.push(`ORG:${esc(org)}`);
    if (title) lines.push(`TITLE:${esc(title)}`);
    emails.filter(Boolean).forEach(e => lines.push(`EMAIL;TYPE=INTERNET:${esc(e)}`));
    phones.filter(Boolean).forEach(p => lines.push(`TEL;TYPE=VOICE:${esc(p)}`));
    links.filter(Boolean).forEach(u => lines.push(`URL:${esc(u)}`));
    if (note) lines.push(`NOTE:${esc(note)}`);
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  };

  const download = (fileName, mimeType, content) => {
    const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Native share sheet on phones; copy the link everywhere else.
  const shareOrCopy = async (title, text, url) => {
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return 'shared'; }
      catch { return 'cancelled'; }
    }
    try { await navigator.clipboard.writeText(url); return 'copied'; }
    catch { return 'copyFailed'; }
  };

  let toastTimer = 0;
  const toast = (message, isError) => {
    const el = document.querySelector('.card-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', !!isError);
    el.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-shown'), 2500);
  };

  const init = ({ qrContainerId, cardUrl, qrColors, title, description, vcard }) => {
    const qr = document.getElementById(qrContainerId);
    if (qr && window.QRCodeStyling) {
      new QRCodeStyling({
        width: 156,
        height: 156,
        type: 'svg',
        data: cardUrl,
        dotsOptions: { color: qrColors.dots, type: 'extra-rounded' },
        cornersSquareOptions: { color: qrColors.cornersSquare, type: 'extra-rounded' },
        cornersDotOptions: { color: qrColors.cornersDot },
        backgroundOptions: { color: qrColors.background },
        qrOptions: { errorCorrectionLevel: 'Q' },
      }).append(qr);
    }

    document.getElementById('card-save')?.addEventListener('click', () => {
      download(`${vcard.fullName.replace(/\s+/g, '_')}.vcf`, 'text/vcard', buildVCard(vcard));
      toast('Contact file downloaded. Open it to add Sharry to your contacts.');
    });

    document.getElementById('card-share')?.addEventListener('click', async () => {
      const result = await shareOrCopy(title, description, cardUrl);
      if (result === 'copied') toast('Link copied. Share it anywhere.');
      else if (result === 'copyFailed') toast('Couldn’t copy the link. Copy it from the address bar instead.', true);
    });

    document.querySelectorAll('[data-year]').forEach(n => { n.textContent = new Date().getFullYear(); });
  };

  return { init, buildVCard };
})();
