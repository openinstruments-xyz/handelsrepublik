# Trade Republic `stableDeviceId`

Verified against the public Trade Republic web bundle served on 2026-07-16:
[`analytics-CeEksguG.js`](https://app.traderepublic.com/assets/analytics-CeEksguG.js).
The same implementation is preserved in the local deminified reference at
`references/traderepublic-web/deminified/analytics-CeEksguG.pretty.js`,
lines 25535-25555.

## How it is generated

The web client does not generate and persist a random device UUID. It creates a
canvas fingerprint:

1. Create a `600x100` canvas.
2. Request a two-dimensional context with `{ alpha: false }`.
3. Set `16px Arial` and an `alphabetic` text baseline.
4. Paint a full-canvas gradient with these stops:
   - `0`: `#FF5733`
   - `0.5`: `#33FF57`
   - `1`: `#3357FF`
5. Draw `TradeRepublic.de: <wealth> 4,0! \u3231` (where the escape represents
   Unicode character U+3231) in
   `rgba(102, 204, 0, 0.7)` after translating by `(10, 40)` and rotating by
   `0.05` radians.
6. Draw a semi-transparent red rectangle at `(50, 30)` with size `90x50`.
7. Stroke a blue circle centered at `(250, 50)` with radius `20`.
8. Read the canvas RGBA bytes with `getImageData`.
9. Keep only the first 10,000 byte values, convert each value to decimal, and
   concatenate them without separators.
10. UTF-8 encode that decimal string, hash it with SHA-512, and return the
    lowercase hexadecimal digest.

Equivalent browser code:

```js
async function generateStableDeviceId() {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 100;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;

  context.font = '16px Arial';
  context.textBaseline = 'alphabetic';

  const gradient = context.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  gradient.addColorStop(0, '#FF5733');
  gradient.addColorStop(0.5, '#33FF57');
  gradient.addColorStop(1, '#3357FF');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = 'rgba(102, 204, 0, 0.7)';
  context.translate(10, 40);
  context.rotate(0.05);
  context.fillText('TradeRepublic.de: <wealth> 4,0! \u3231', 0, 20);
  context.rotate(-0.05);
  context.translate(-10, -40);

  context.fillStyle = 'rgba(255, 0, 0, 0.5)';
  context.fillRect(50, 30, 90, 50);

  context.strokeStyle = 'blue';
  context.beginPath();
  context.arc(250, 50, 20, 0, Math.PI * 2);
  context.stroke();

  const pixels = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
  const fingerprintInput = Array.from(pixels)
    .slice(0, 10_000)
    .join('');
  const bytes = new TextEncoder().encode(fingerprintInput);
  const digest = await crypto.subtle.digest('SHA-512', bytes);

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
```

The resulting 128-character hexadecimal string is placed in `stableDeviceId`.
The complete device-information object is serialized with `JSON.stringify` and
encoded with browser `btoa` for the `X-TR-Device-Info` header.

In `handelsrepublik`, this decoded object is stored as `session.deviceInfo`.
Outgoing requests serialize and Base64-encode that canonical session field.

For a new client without explicit `deviceInfo`, the SDK does not reproduce the
canvas algorithm. It creates a random 64-byte hexadecimal `stableDeviceId`,
reads processor count, memory, OS release, and timezone from Node, and fills the
remaining browser-only fields with a Firefox profile and plausible desktop
values. Callers can override any generated field through
`TradeRepublicClientOptions.deviceInfo`. The completed profile is then
persisted with the session and reused.

## Stability characteristics

The name is somewhat misleading: the ID is stable only while the browser's
canvas rasterization remains identical. It can change with the browser,
operating system, graphics stack, font rendering, installed or substituted
Arial font, display/rendering configuration, browser privacy defenses, or
automation/headless environment.

The other fields in `X-TR-Device-Info` do not participate in this hash. They are
collected separately from UA parsing, `Intl`, `screen`, and `navigator`, then
merged with the canvas digest before Base64 encoding.
