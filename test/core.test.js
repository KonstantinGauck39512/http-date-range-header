import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIfRange, KIND } from '../src/core.js';

/*
 * Tests are grouped by the kind of result they target. The library is
 * deterministic and makes no clock calls, so no fakes are needed.
 */

test('entity-tag: parses a strong validator', () => {
  const r = parseIfRange('"abc123"');
  assert.equal(r.kind, KIND.ENTITY_TAG);
  assert.equal(r.value, '"abc123"');
  assert.equal(r.weak, false);
  assert.equal(r.date, null);
});

test('entity-tag: parses a weak validator', () => {
  const r = parseIfRange('W/"v2"');
  assert.equal(r.kind, KIND.ENTITY_TAG);
  assert.equal(r.value, 'W/"v2"');
  assert.equal(r.weak, true);
});

test('entity-tag: keeps backslash escapes verbatim (no unescaping)', () => {
  const r = parseIfRange('"a\\"b"');
  assert.equal(r.kind, KIND.ENTITY_TAG);
  assert.equal(r.value, '"a\\"b"');
});

test('http-date: parses a well-formed IMF-fixdate', () => {
  const r = parseIfRange('Wed, 21 Oct 2015 07:28:00 GMT');
  assert.equal(r.kind, KIND.HTTP_DATE);
  assert.equal(r.value, '2015-10-21T07:28:00.000Z');
  assert.ok(r.date instanceof Date);
  assert.equal(r.date.toISOString(), '2015-10-21T07:28:00.000Z');
});

test('http-date: accepts a non-GMT alphabetic zone token (treated as GMT)', () => {
  const r = parseIfRange('Wed, 21 Oct 2015 07:28:00 UTC');
  assert.equal(r.kind, KIND.HTTP_DATE);
  assert.equal(r.value, '2015-10-21T07:28:00.000Z');
});

test('http-date: rejects a value whose weekday does not match the date', () => {
  // 21 Oct 2015 was a Wednesday, not Monday.
  const r = parseIfRange('Mon, 21 Oct 2015 07:28:00 GMT');
  assert.equal(r.kind, KIND.INVALID);
  assert.equal(r.date, null);
});

test('http-date: rejects impossible day-of-month (31 Feb)', () => {
  const r = parseIfRange('Tue, 31 Feb 2024 10:00:00 GMT');
  assert.equal(r.kind, KIND.INVALID);
  assert.equal(r.date, null);
});

test('http-date: rejects leap-second :60', () => {
  const r = parseIfRange('Wed, 21 Oct 2015 07:28:60 GMT');
  assert.equal(r.kind, KIND.INVALID);
});

test('http-date: rejects RFC 850 asctime form even though RFC 7231 mentions it', () => {
  const r = parseIfRange('Sun Nov  6 08:49:37 1994');
  assert.equal(r.kind, KIND.INVALID);
});

test('http-date: rejects RFC 850 comma-suffix form', () => {
  const r = parseIfRange('Sunday, 06-Nov-94 08:49:37 GMT');
  assert.equal(r.kind, KIND.INVALID);
});

test('invalid: rejects an unquoted bare token', () => {
  const r = parseIfRange('abc123');
  assert.equal(r.kind, KIND.INVALID);
  assert.equal(r.value, null);
  assert.equal(r.date, null);
});

test('invalid: rejects a malformed entity-tag missing its closing quote', () => {
  const r = parseIfRange('"abc');
  assert.equal(r.kind, KIND.INVALID);
});

test('invalid: rejects empty string', () => {
  const r = parseIfRange('');
  assert.equal(r.kind, KIND.INVALID);
  assert.equal(r.raw, '');
});

test('invalid: rejects null and undefined', () => {
  assert.equal(parseIfRange(null).kind, KIND.INVALID);
  assert.equal(parseIfRange(undefined).kind, KIND.INVALID);
});

test('invalid: rejects a non-string input (number)', () => {
  const r = parseIfRange(12345);
  assert.equal(r.kind, KIND.INVALID);
  assert.equal(r.raw, 12345);
});

test('invalid: rejects two quotes only (empty quoted-string not valid per §2.3)', () => {
  // RFC 7232 §2.3 requires at least one ETAGC between quotes.
  const r = parseIfRange('""');
  assert.equal(r.kind, KIND.INVALID);
});

test('raw: preserves the original input, including surrounding whitespace', () => {
  const r = parseIfRange('  Wed, 21 Oct 2015 07:28:00 GMT  ');
  assert.equal(r.kind, KIND.HTTP_DATE);
  assert.equal(r.raw, '  Wed, 21 Oct 2015 07:28:00 GMT  ');
});
