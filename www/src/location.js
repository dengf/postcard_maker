/**
 * A best-guess postmark location, detected without ever asking for a
 * permission this app family has never asked for before (GPS) and
 * without a network call to a geocoding service, which would mean
 * sending someone's location to a third party -- flatly against this
 * app's whole "nothing leaves your device" premise. `Intl.DateTimeFormat`
 * already exposes the browser's IANA timezone (e.g. "Asia/Singapore")
 * with zero permission prompt and zero request; most zone names are
 * themselves a representative city, so the last path segment is usually
 * a reasonable guess. Coarser than real geolocation -- "America/New_York"
 * covers a whole region, not one city -- and that's the deliberate
 * trade for staying permission-free. Always editable; never authoritative.
 */
export function detectLocation() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!zone || zone.startsWith('Etc/') || zone === 'UTC') return '';
    const city = zone.split('/').pop();
    return city ? city.replace(/_/g, ' ') : '';
  } catch {
    return '';
  }
}
