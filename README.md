# HTTP If-Range Header Parser

A single-purpose library that parses an HTTP `If-Range` header value and
classifies it as either an entity-tag, an HTTP-date, or invalid. Nothing else.

## Why

`If-Range` is awkward: the header carries one of two structurally
different forms (an entity-tag like `"abc123"` or `W/"v2"`, or a date like
`Wed, 21 Oct 2015 07:28:00 GMT`). Most date parsers happily accept every date
format RFC 7231 allows; `If-Range` (RFC 7233 §3.2) is narrower and only permits
the IMF-fixdate form. This library deliberately rejects RFC 850 dates and
asctime dates for `If-Range`, because that is what the spec requires and because
accepting them would let stale values silently look fresh.

The trade-off: you lose lenient parsing of exotic date forms in exchange for
spec-accurate rejection.

## Usage

```js
import { parseIfRange, KIND } from './src/index.js';

const a = parseIfRange('"v2"');
// { kind: 'entity-tag', value: '"v2"', date: null, weak: false, raw: '"v2"' }

const b = parseIfRange('Wed, 21 Oct 2015 07:28:00 GMT');
// { kind: 'http-date', value: '2015-10-21T07:28:00.000Z',
//   date: Date, weak: false, raw: 'Wed, 21 Oct 2015 07:28:00 GMT' }

const c = parseIfRange('garbage');
// { kind: 'invalid', value: null, date: null, weak: false, raw: 'garbage' }
```

The exported names are `parseIfRange` (the function) and `KIND` (a frozen
object whose `.ENTITY_TAG`, `.HTTP_DATE`, and `.INVALID` strings are the same
strings returned as `kind`).

## Edge cases you will hit

- **Backslash escapes in entity-tags are kept verbatim.** The library does not
  unescape `\"` or `\\`; entity-tag comparison is byte-for-byte against the
  resource's `ETag` response header, so unescaping here would corrupt that
  comparison.
- **Leap seconds (`:60`) are rejected.** ECMAScript's `Date.UTC` silently maps
  `:60` to `:00` of the next minute; rejecting is safer than a wrong date.
- **Empty quoted-string `""` is rejected** because RFC 7232 §2.3 requires at
  least one character between the quotes.
- **Only IMF-fixdate is accepted** as the date form. RFC 850 comma-suffix dates
  and asctime dates are reported as `invalid`, which is stricter than general
  HTTP date parsers but correct for `If-Range`.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Contributing

Issues and pull requests are welcome. Please keep the dependency list empty —
that constraint is the point of the project, not an oversight.

