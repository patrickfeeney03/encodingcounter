# Countdown Link (No Backend)

Static frontend app that generates shareable countdown links.

## Run

- Dev: `npm run dev`
- Build: `npm run build`
- Preview build: `npm run preview`

## Links

### Unsigned

Unsigned links encode the target time in the URL and are freely editable.

### Signed (shared passphrase, v=1)

Signed links are tamper-evident using an **HMAC** derived from a passphrase:
- Anyone who knows the passphrase can verify.
- Anyone who knows the passphrase can also create new signed links.

Verification works with **no network requests**.

Limitations (no backend): no issuance tracking, no revocation list, and no way to distinguish which person-with-the-passphrase created a link.
