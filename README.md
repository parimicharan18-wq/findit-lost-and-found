# FindIt — Lost and Found

FindIt is a static lost-and-found website. It helps visitors search reports, create lost or found listings, open item details, share links, and generate QR codes. It can use an optional Supabase project for a shared community board; that mode stays off until configured.

**Live site:** https://parimicharan18-wq.github.io/findit-lost-and-found/

## What works today

- Search and filter sample and locally created reports. When the optional backend is configured, community reports are visible across browsers.
- Save and delete reports in the current browser profile.
- Add a JPEG, PNG, or WebP photo; the browser validates, resizes, and compresses it before local storage. Shared mode uploads optional photos to a public, size-limited bucket.
- Open a report from its hash link and generate, download, or print a QR code for found reports.
- Share listing details without including the email address or photo in the share payload.
- In configured shared mode, send a private message to a report owner and read replies in the browser-local inbox. Reporter email is not sent to the database.
- Use the camera scanner where the browser supports `BarcodeDetector` and grants camera access.
- Get explainable rule-based candidate matches for lost reports.
- Install FindIt as a PWA. After the first successful online load, the service worker caches the app shell, QR library, and bundled sample-item images.
- Browse the last cached community feed while offline. New lost/found reports are saved locally first and placed in an IndexedDB outbox; they are uploaded automatically after reconnection. Android Chrome can use Background Sync where available; other browsers retry when the app is opened or returns online.
- Keep locally created reports and compressed photos available on the same device while offline. Browser storage persistence is requested where the browser supports it.

## Offline behaviour and limits

Offline mode covers the app shell, cached community listings, local search/filtering, and creating/viewing local lost/found reports. It does not make the remote service run offline: sign-in and account changes, registering server-backed QR tags, validating a QR token that has not been cached on this device, sending private messages, and reading the live owner dashboard still require a connection. A report only appears on the shared community board after its queued upload succeeds. Background Sync is browser-controlled and not guaranteed; the app also retries when it opens or receives an online event.

The community photo bucket accepts files up to 280,000 bytes. If a locally saved photo exceeds that upload limit, the report can still sync but its photo may remain local. Keep the FindIt browser storage intact until queued reports show as synced; clearing site data removes the local queue and the private recovery keys.

## Important: static demo limits

Without a configured Supabase project, FindIt runs as a local demo: reports, email, and photos stay in the browser profile that created them. A shared link carries public item fields, but does not add the report to other visitors' search results.

When shared mode is configured, public item details appear in a shared feed. The database does not store reporter email or browser recovery tokens. Private contact messages are stored in Supabase and can be read only with the report recovery token kept in the browser where the report was posted. FindIt does not send email notifications, provide user accounts, recover tokens after browser data is cleared, or moderate public listings. Photos uploaded in shared mode are publicly accessible item images. Do not include faces, ID cards, addresses, or other personal information in a photo.

Do not enter sensitive information or exact private addresses. QR/share links expose the item's public report details to anyone who has the URL. Shared report ownership depends on a recovery token saved in the report owner's browser; clear browser data can permanently remove access to deletion and inbox features. Review [SUPABASE_SETUP.md](SUPABASE_SETUP.md) and the provider's free-plan limits before enabling shared mode.

## Run locally

Install Node.js 20 or later, then:

```powershell
npm ci
npm run check
npm run build
npm test
```

The Playwright test command requires Chromium. Install it once with:

```powershell
npx playwright install chromium
```

For a live local preview of the production build:

```powershell
node scripts/serve.mjs dist
```

Open `http://127.0.0.1:4173`. The preview binds only to loopback and does not touch other local server processes.

## GitHub automation and publishing

- Pull requests and pushes to `main` and `codex/**` run JavaScript syntax checks, `npm audit`, a production build, and Playwright browser journeys.
- The `main` branch is published to GitHub Pages only after the quality job passes. A manual run from `main` also deploys only after tests pass, then checks the published page and its local assets.
- `Security checks` runs CodeQL and Gitleaks on pull requests, pushes, and weekly. CodeQL results are not uploaded to the repository Security tab, so the workflow keeps its token read-only. Dependabot checks the npm development dependency and GitHub Actions pins weekly.
- Workflows use read-only repository access except the Pages deployment job, which receives the Pages write and OIDC permissions it needs.

To roll back a published change, revert its commit on `main` and push the revert. The test workflow runs again before Pages deploys it. This restores source files, not any data kept in visitors' local browsers.

## Privacy and security

See [SECURITY.md](SECURITY.md) for current threat boundaries and reporting guidance, [FREE_TIER_POLICY.md](FREE_TIER_POLICY.md) for services, costs, and quotas, and [SUPABASE_SETUP.md](SUPABASE_SETUP.md) to enable the shared board. In local-demo mode, there are no runtime API keys or third-party requests. The QRCode.js source is vendored under `vendor/qrcodejs/` with its upstream MIT notice. Existing photo asset provenance has not been established in the repository and should be confirmed by the project owner before commercial redistribution.

The optional backend uses a public Supabase publishable/anon key protected by database grants and row-level security. The key is not a secret. Never put a Supabase secret/service-role key in `shared-config.js`. Shared mode is disabled when the config fields are empty.

## Licence

The repository has no project-level licence. No licence has been added, so the source is not granted an open-source licence by this change. The vendored QRCode.js file retains its own upstream MIT licence notice.

## Owner accounts and registered-item tags

The owner portal upgrade adds Supabase Auth forms, owner-scoped item/report tables, hashed QR tokens, anonymous finder submissions, and a Resend-backed notification function. To activate it on the hosted Supabase project:

1. Apply `supabase/migrations/20261106000000_owner_accounts_and_qr_reports.sql` and then `supabase/migrations/20261113000000_add_owner_sms_status.sql` in the correct Supabase project's SQL editor.
2. Deploy `supabase/functions/submit-finder-report` with the Supabase CLI.
3. Set the Edge Function secrets `RESEND_API_KEY` and `FINDIT_FROM_EMAIL` to a verified Resend sender address for email.
4. For SMS, set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and either `TWILIO_MESSAGING_SERVICE_SID` (recommended) or `TWILIO_FROM_NUMBER` in Supabase Edge Function secrets. Never put provider credentials in browser code or GitHub.
5. Owner registration must save a reachable mobile number in the owner's profile. Indian 10-digit mobile numbers are converted to +91; international numbers must be entered in E.164 format (for example, +14155552671).
6. Submit a test finder report using a QR tag and confirm the email and SMS arrive. SMS delivery depends on an active Twilio account, an eligible sender, destination-country permissions, and sufficient account balance.

To enable Google sign-in, enable Google under Supabase Authentication → Sign In / Providers and add the Supabase callback URL shown there to the Google OAuth client. Add the FindIt Pages URL to the allowed redirect URLs. To enable phone sign-in, configure an SMS provider under Supabase Authentication → Sign In / Providers → Phone, enable phone OTP, and set the SMS rate limits. These provider settings are controlled by the Supabase project owner; the website only starts the secure OAuth or OTP flow.

Finder reports are private under row-level security. QR tags contain random tokens while the database stores only SHA-256 hashes. If the migration or function is not deployed, these owner/finder features cannot work even though the static website itself loads.
