# FindIt — Lost and Found

FindIt is a static lost-and-found website prototype. It helps visitors search sample reports, create a local lost or found report, open item details, share a public-detail link, and generate a QR code for a found-item report.

**Live site:** https://parimicharan18-wq.github.io/findit-lost-and-found/

## What works today

- Search and filter sample and locally created reports.
- Save and delete reports in the current browser profile.
- Add a JPEG, PNG, or WebP photo; the browser validates, resizes, and compresses it before local storage.
- Open a report from its hash link and generate, download, or print a QR code for found reports.
- Share listing details without including the email address or photo in the share payload.
- Use the camera scanner where the browser supports `BarcodeDetector` and grants camera access.
- Get explainable rule-based candidate matches for lost reports.

## Important: static demo limits

There is no application server, database, account system, authentication, shared listing feed, server-side ownership verification, secure contact relay, moderation, or notifications. A report and its email/photo are stored only in the browser profile that created it. A shared link carries the item's public fields, but it does not publish that report into another user's search results. The contact action opens a mail application with a draft; FindIt does not send the message.

Do not enter sensitive information or exact private addresses. QR/share links expose the item's public report details to anyone who has the URL. The app cannot enforce account-level access controls or deletion across devices. For a real multi-user service, a backend and a privacy/security design are required; those features are not simulated here.

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

See [SECURITY.md](SECURITY.md) for current threat boundaries and reporting guidance, and [FREE_TIER_POLICY.md](FREE_TIER_POLICY.md) for services, costs, and quotas. The application has no runtime API keys or third-party requests. The QRCode.js source is vendored under `vendor/qrcodejs/` with its upstream MIT notice. Existing photo asset provenance has not been established in the repository and should be confirmed by the project owner before commercial redistribution.

## Licence

The repository has no project-level licence. No licence has been added, so the source is not granted an open-source licence by this change. The vendored QRCode.js file retains its own upstream MIT licence notice.
