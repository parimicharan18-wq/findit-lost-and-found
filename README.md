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
