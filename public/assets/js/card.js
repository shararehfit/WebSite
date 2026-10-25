/* Fitnex business card: page settings for business-card.js */
document.addEventListener('DOMContentLoaded', () => {
  fitnexCard.init({
    qrContainerId: 'card-qr',
    cardUrl: 'https://fitnex.at/card/',
    qrColors: { dots: '#4B3BC4', cornersSquare: '#6C5CE7', cornersDot: '#F25C9B', background: '#F7F5FF' },
    title: 'Sharry, Personal Trainer at Fitnex',
    description: 'Personal training, online coaching and small-group strength training.',
    vcard: {
      fullName: 'Sharry',
      org: 'Fitnex',
      title: 'Personal trainer and strength coach',
      emails: ['sharareh.fit@gmail.com'],
      phones: [],
      links: ['https://fitnex.at/', 'https://fitnex.at/card/'],
      note: 'Personal training, online coaching and small-group strength training.',
    },
  });
});
