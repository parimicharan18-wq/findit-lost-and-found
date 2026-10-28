# FindIt prototype

FindIt is currently a static front-end prototype. It has no application server, database, account system, or shared public listings.

## Run locally

From this folder, run:

```powershell
python -m http.server 8001 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8001` in a browser. Port `8000` was unavailable in this environment. The supplied project does not configure port `5000`.

## Current prototype features

- Browse sample lost and found reports; samples are labelled in the interface.
- Search reports and filter by report type and category.
- Create a lost or found report and save it in the current browser's local storage.
- See rule-based, explainable candidate matches between lost and found reports.
- Open a report from its URL hash, and generate a QR code for found reports when the QR library CDN is reachable.
- Copy a report link, download the QR as PNG, or print the QR view.
- Switch between light and dark themes; the preference is stored in this browser.
- Existing reports from the earlier Foundly prototype are migrated from its local storage key when available.
- Failed local-storage writes are reported, and the app does not pretend an unsaved report was saved.

## Important limitations

Local storage is specific to one browser profile and device. It does not publish reports to other people, provide authentication or authorization, or back up data. Do not enter sensitive personal information. Contact requests use the device's email application and are not mediated by a server. QR links to this local prototype are not public links and will not resolve for other users unless the app is deployed with a shared backend and a public domain.

The QR generator and web fonts are loaded from external CDNs, so those features may not load offline. The app has no backend or database.

## Free public publishing with GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` publishes this static site whenever changes are pushed to `main`, and can also be started manually from the repository's Actions tab.

1. Create an empty **public** GitHub repository. GitHub Pages is available for public repositories on GitHub Free.
2. Add this project to the repository and push the first commit to `main`.
3. In the repository, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. The workflow will deploy the site. Later pushes to `main` automatically publish the latest version.

The source code remains editable in the repository. Automatic deployment publishes changes after they are pushed; it does not independently create or edit app features. A public repository means the source files are visible to everyone.

## Free AI and data limits

The current match suggestions use transparent, rule-based text and category matching in the browser. They require no AI service or API key, but they are not generative AI. A hosted generative AI feature needs an external service and may have usage limits or costs; this app does not include one.

GitHub Pages only hosts the static front end. New reports and saved items remain in each visitor's browser, so separate visitors do not share a common live item list. The share link can carry one report's public details, but it does not synchronize reports or contact information across devices.
