// Site-wide settings. Paste your links here; empty values hide or soften the related buttons.
export const CONFIG = {
  // Stripe Payment Link or Gumroad "pay what you want" product URL.
  DONATE_URL: 'https://faheemprime.gumroad.com/l/yhttrn',
  // Tally form id, from a link like https://tally.so/r/<id>
  TALLY_FORM_ID: 'kbbMjo',
  // Fallback when no Tally form is set.
  FEEDBACK_EMAIL: '',
  REPO_URL: 'https://github.com/FaheemMuhamed/poster-generator',
  SITE_URL: 'https://morva-studio.com/',
};

// Link to a mode's source file, for "How it works".
export const sourceUrl = (path) => `${CONFIG.REPO_URL}/blob/main/${path}`;
