# Security policy and limits

## Supported version

Security fixes are made on the default `main` branch. Report the affected commit and a clear reproduction. Do not include passwords, access tokens, private contact details, or real item photos in an issue. If GitHub offers private vulnerability reporting for this repository, use that feature; otherwise contact the repository owner privately before publishing a security-sensitive detail.

## Checks configured

- GitHub CodeQL analyzes JavaScript/TypeScript on pull requests, pushes, and a weekly schedule. Findings are not uploaded to the Security tab because this workflow does not request `security-events: write`.
- Gitleaks scans repository history for committed secrets on the same events.
- `npm audit --audit-level=high` and browser tests run before deployment.
- A restrictive document Content Security Policy loads scripts only from the site itself. Database, private-message, and public-photo requests are allowed only to the configured Supabase project origin; the QR generator is stored in the repository.

## Known application boundaries

FindIt runs locally by default and can be connected to an optional Supabase project. In local mode, reports, contact email, and photos remain in the current browser profile; there is no shared database or server-side ownership. In shared mode, public item details and optional photos are stored in Supabase. Reporter email is kept in the owner's browser, not the public report table. Contact messages and the sender's reply email are stored in a separate table that has no direct public table grants; an RPC returns messages only when given the matching 256-bit recovery token. The token is stored in browser local storage and the database retains only its SHA-256 hash. Anyone who obtains the owner's browser profile data or token can access that report's inbox and deletion action. Clearing browser data can permanently remove access.

The shared mode does not include user accounts, email notifications, moderation, malware scanning, or production-grade abuse response. Public photos can be opened by anyone with their URLs. SQL write RPCs apply per-client request limits, but this is a small community demo and these controls do not replace a reviewed production service. Public share links and QR codes contain report details and can be forwarded. Email addresses, item details, and photos are not encrypted by FindIt. Avoid sensitive information, exact home addresses, ID documents, and faces.

The browser validates image MIME type and size, decodes images, limits dimensions, and stores a resized JPEG. Shared storage also limits image MIME types and size, but this is not malware scanning. Client-side checks do not replace server-side file inspection. Image EXIF metadata is not intentionally copied into the resized JPEG, but browser-specific behavior has not been audited as a guarantee.

Do not use this prototype to store sensitive personal information, exact home addresses, identity documents, or high-risk belongings. A production deployment needs a formal threat review, account recovery, moderation, retention/deletion controls, monitored abuse protections, and tested operational recovery.
