# Security policy and limits

## Supported version

Security fixes are made on the default `main` branch. Report the affected commit and a clear reproduction. Do not include passwords, access tokens, private contact details, or real item photos in an issue. If GitHub offers private vulnerability reporting for this repository, use that feature; otherwise contact the repository owner privately before publishing a security-sensitive detail.

## Checks configured

- GitHub CodeQL analyzes JavaScript/TypeScript on pull requests, pushes, and a weekly schedule. Findings are not uploaded to the Security tab because this workflow does not request `security-events: write`.
- Gitleaks scans repository history for committed secrets on the same events.
- `npm audit --audit-level=high` and browser tests run before deployment.
- A restrictive document Content Security Policy limits scripts and network requests to the same origin; the QR generator is stored in the repository.

## Known application boundaries

FindIt is a static demo. It has no server, identity system, authorization checks, or shared database. Local storage can be read and modified by the browser profile owner and may be cleared by browser settings. Email, locations, descriptions, and photos are not encrypted by FindIt. Public share links and QR codes contain item details and can be forwarded. Contact links open the user's mail app; no secure relay or server-side spam controls exist. The app does not verify ownership claims or coordinate returns.

The browser validates image MIME type and size, decodes images, limits dimensions, and stores a resized JPEG. This is client-side validation, not a substitute for server-side file inspection. Image EXIF metadata is not intentionally copied into the resized JPEG, but browser-specific behavior has not been audited as a guarantee.

Do not use this prototype to store sensitive personal information, exact home addresses, identity documents, or high-risk belongings. A production deployment needs server-side validation, authentication, authorization, rate limiting, retention/deletion controls, and a secure contact flow.
