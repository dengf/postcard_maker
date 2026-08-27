/**
 * Composing a mail-client link for a finished postcard.
 *
 * Nothing is sent from here. The app is a static site that promises
 * nothing you make is sent anywhere, and it keeps that promise by handing
 * the message to the reader's own mail client and stepping back.
 *
 * A `mailto:` link cannot carry an attachment. That is a limitation of the
 * scheme, not an oversight: this is the fallback path for when the Web
 * Share API isn't available (see `export.js`/`ShareBar.jsx`) -- the image
 * is saved first, and the mail body says so rather than leaving the reader
 * to wonder where the postcard went. Ported verbatim from
 * `budget_planner`'s `mailto.js`.
 */

/** Addresses as typed -- separated by commas, semicolons or spaces. */
export function parseRecipients(input) {
  return String(input ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function looksLikeAddress(address) {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address);
}

/**
 * The `mailto:` URL for a postcard.
 *
 * RFC 6068: the recipient list is comma-separated, and everything else is
 * percent-encoded. Semicolons are normalized to commas on the way in.
 */
export function mailtoUrl({ recipients, subject, body }) {
  const to = parseRecipients(recipients).map(encodeURIComponent).join(',');
  const query = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ]
    .filter(Boolean)
    .join('&');

  return `mailto:${to}${query ? `?${query}` : ''}`;
}
