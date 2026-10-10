/*
 * Core implementation for parsing the HTTP If-Range header (RFC 7233 §3.2).
 *
 * If-Range may carry EITHER a single entity-tag OR a single HTTP-date.
 * Per the grammar the two forms are mutually exclusive: a header that does
 * not match exactly one of them is invalid, and a 200 response is expected.
 */

/* Tagged string constants so callers can compare with === rather than
 * matching magic strings. Returned in every result object as `kind`. */
export const KIND = Object.freeze({
  ENTITY_TAG: 'entity-tag',
  HTTP_DATE: 'http-date',
  INVALID: 'invalid',
});

/*
 * RFC 7232 §2.3 defines a canonical strong entity-tag as:
 *   DQUOTE *ETAGC DQUOTE
 * with optional a leading W/ for weak validators. ETAGC is any VCHAR except
 * DQUOTE and backslash. We accept literal "\" and "\"" escape sequences
 * (which the ABNF permits) but we do NOT unescape them: the validator tag
 * is meant to be compared byte-for-byte against the resource's own ETag
 * header, and unescaping here would silently alter that comparison.
 */
const ENTITY_TAG_RE = /^(W\/(?="))?"(([^\x00-\x1F\x7F"\\])|\\"|\\\\)+"$/v;

/*
 * RFC 7231 §7.1.1.1 IMF-fixdate, the format we support.
 * We deliberately support only this one: case-insensitive month names,
 * numeric day, two- or four-digit year, two-digit time fields. Other date
 * forms permitted by older RFCs (RFC 850, asctime) are rejected as invalid
 * for If-Range because Section 3.2 of RFC 7233 restricts If-Range to
 * IMF-fixdate.
 */
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const HTTP_DATE_RE =
  /^([A-Za-z]+),\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}|\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+([A-Za-z]+)$/;

/* Day names per IMF-fixdate; we accept case-insensitively since Section 7.1.1.1
 * token grammar is case-insensitive and being strict on day-of-week casing
 * would reject otherwise valid, interoperable values. */
const WEEKDAYS = new Set([
  'sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat',
]);

/*
 * Parse an HTTP-date in IMF-fixdate form. Returns null if the value is
 * syntactically or semantically invalid (bad weekday, bad month name,
 * out-of-range day/hour/minute/second, etc.).
 *
 * We return a Date in UTC. We do NOT honour the zone token: IMF-fixdate
 * mandates GMT. We accept any non-empty zone token because Section 7.1.1.1
 * formally requires "GMT" but in practice tolerant servers accept any
 * alphabetic token; we draw the line at rejecting only non-alphabetic junk
 * and we normalise as if GMT were present.
 */
function parseHttpDate(value) {
  const m = HTTP_DATE_RE.exec(value);
  if (!m) return null;

  const [, weekday, dayStr, monthName, yearStr, hStr, minStr, secStr] = m;

  const wd = weekday.toLowerCase().slice(0, 3);
  if (!WEEKDAYS.has(wd)) return null;

  const month = MONTHS[monthName.toLowerCase()];
  if (month === undefined) return null;

  const day = parseInt(dayStr, 10);
  const year = yearStr.length === 2
    ? (parseInt(yearStr, 10) + 2000)
    : parseInt(yearStr, 10);
  const hours = parseInt(hStr, 10);
  const minutes = parseInt(minStr, 10);
  const seconds = parseInt(secStr, 10);

  if (day < 1 || day > 31) return null;
  if (hours > 23) return null;
  if (minutes > 59) return null;
  // IMF-fixdate allows the leap second :60; reject it because ECMAScript's
  // Date.UTC clamps :60 to :00 of the next minute, which would be silently
  // wrong. Better to treat the whole header as invalid.
  if (seconds > 59) return null;

  const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  if (Number.isNaN(d.getTime())) return null;
  // Cross-check the reconstructed date: if the day-of-month overflowed
  // the month (e.g. 31 Feb), Date.UTC silently rolls it over and we reject.
  if (d.getUTCFullYear() !== year
      || d.getUTCMonth() !== month
      || d.getUTCDate() !== day) {
    return null;
  }
  // Verify the day-of-week matches what the date actually lands on.
  if (d.getUTCDay() !== [...WEEKDAYS.keys()].indexOf(wd)) {
    return null;
  }
  return d;
}

/*
 * Determine whether `value` is a structurally valid entity-tag.
 */
function isEntityTag(value) {
  return ENTITY_TAG_RE.test(value);
}

/*
 * Parse an If-Range header value.
 *
 * The header is EITHER an entity-tag OR an HTTP-date, never both. We
 * discriminate first on structure, then validate the chosen form. Any
 * value that fails both checks is reported as INVALID. A null, undefined,
 * or non-string input is also INVALID; this matches how servers typically
 * treat missing/absent header values.
 *
 * @param {string} value - Raw If-Range header value.
 * @returns {{
 *   kind: 'entity-tag'|'http-date'|'invalid',
 *   value: string|null,    // the entity-tag string, ISO date string, or null
 *   date: Date|null,       // present only for http-date
 *   weak: boolean,         // true only for a weak entity-tag (W/ prefix)
 *   raw: string|null,      // the original input, or null
 * }}
 */
export function parseIfRange(value) {
  if (typeof value !== 'string') {
    return { kind: KIND.INVALID, value: null, date: null, weak: false, raw: value ?? null };
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { kind: KIND.INVALID, value: null, date: null, weak: false, raw: value };
  }

  if (isEntityTag(trimmed)) {
    const weak = trimmed.startsWith('W/');
    return { kind: KIND.ENTITY_TAG, value: trimmed, date: null, weak, raw: value };
  }

  const date = parseHttpDate(trimmed);
  if (date) {
    return { kind: KIND.HTTP_DATE, value: date.toISOString(), date, weak: false, raw: value };
  }

  return { kind: KIND.INVALID, value: null, date: null, weak: false, raw: value };
}
