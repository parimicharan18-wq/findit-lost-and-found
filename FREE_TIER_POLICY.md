# Free-tier and external service policy

Last checked: 2026-10-29. Provider terms and free tiers can change; re-check before relying on them.

## Runtime services

| Service | Use | Cost/limits | Credentials | If unavailable / how to disable |
| --- | --- | --- | --- | --- |
| GitHub Pages | Hosts the static website from the public GitHub repository | Available for public repositories on GitHub Free. GitHub documents a recommended 1 GB source repository limit, a 1 GB published site limit, a soft 100 GB/month bandwidth limit, and deployment timeout/build constraints. It is not an application server or database. | GitHub account and repository; no app API key | The last deployed site remains available until GitHub Pages is disabled or the deployment is replaced. Disable via repository Settings → Pages or remove/disable the deployment workflow. See [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). |
| GitHub Actions | Tests, CodeQL/Gitleaks checks, and Pages deployment | Standard GitHub-hosted runners for public repositories have no billed minute quota under current GitHub docs; other actions, storage, policy, and terms can change. This is not a promise of permanent free service. | GitHub account; workflow uses the built-in token with job-scoped permissions | Disable individual workflows in `.github/workflows/`. No paid runner or third-party action marketplace service is activated. See [GitHub Actions billing](https://docs.github.com/en/actions/concepts/billing-and-usage). |
| Supabase (optional; disabled by default) | Shared reports, public item photos, private contact-message inbox | Current Free plan quotas include 500 MB database per project, 1 GB file storage, and 5 GB egress. Free projects can pause after a week of low activity. Limits and terms can change; the app does not enable paid overages. See [Supabase plan quotas](https://supabase.com/docs/guides/platform/billing-on-supabase) and [free project limits](https://supabase.com/docs/guides/platform/going-into-prod#free-plan). | Project URL and public publishable/anon key in `shared-config.js`; never a service/secret key | Keep both config values blank to disable all Supabase calls. Disable by clearing the config and publishing. Shared photos are public; messages are readable only with the report recovery token saved in the owner's browser. The Free plan has no production availability guarantee. |

## Code and development dependencies

| Component | Licence / purpose | Cost and data | Failure behavior / disable |
| --- | --- | --- | --- |
| Node.js + npm | Local build/test runtime | Free software; project scripts do not require an external account or transmit app reports | Static site can still be edited without it; build/tests need Node. |
| Playwright Test `@playwright/test` 1.64.1 | Apache-2.0, development-only Chromium browser tests | No paid service/API key. CI downloads the pinned npm package and browser. npm audit checks known advisories. | Remove the dev dependency and test scripts/workflow steps to disable browser automation. |
| QRCode.js 1.0.0 | MIT, vendored at `vendor/qrcodejs/` with its upstream notice | No external request at runtime, no account or API key | QR generation shows an unavailable message if the local file is missing. |
| Gitleaks CLI 8.30.1 | MIT, downloaded from its official release and SHA-256 verified in the security workflow | No paid service/account/API key; scans repository history in GitHub Actions | A scanner download/checksum failure fails the security job; disable in `security.yml` only if replacing it with an equivalent secret scan. |
| GitHub Actions used in workflows | Marketplace actions are pinned to verified commit SHAs | No extra paid service intentionally selected; actual account-level policies still apply | Disable the related workflow file. |

There is no generative AI integration, AI API key, image-generation service, external font request, runtime CDN, paid subscription, or automated AI code repair. Matching is deterministic browser-side text/category scoring. No application telemetry or external error monitor is configured. The optional Supabase connection is disabled until configured and is not used for AI. GitHub workflow status is the available build/deployment signal; repository notification settings control alerts.

## Application data and quota behavior

In local-demo mode, reports, saved IDs, theme preference, contact email, and resized photos stay in the visitor's browser storage. When optional Supabase shared mode is enabled, public item fields and public photos are stored in the configured project; reporter email stays local. Private inbox messages, including the sender's reply email, are stored in Supabase and can be read only with the report recovery token kept in the owner's browser. Clearing that browser's storage loses the token. A share link embeds selected public item fields in its URL fragment; email and photo are omitted from that payload.

## Budget guardrails

- Do not add paid APIs, hosting, runners, storage, or model services without explicit owner approval.
- Do not add integrations that need a payment method or API key without first documenting their limits and disabling them by default.
- Free tiers and software licences may change; update this document when dependencies or providers change.
- Shared mode is not enabled in the public `shared-config.js` until a Supabase project has been created and its migration has been applied.
