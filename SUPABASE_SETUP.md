# Enable the shared FindIt board

FindIt is a static GitHub Pages site. Shared reports use a Supabase Postgres project and Storage; no server-role key is needed in the browser. The integration stays disabled while the two fields in `shared-config.js` are empty.

## Set up Supabase

1. Create a Supabase project on the Free plan. Free projects can pause after a week with little activity and have storage, database, and bandwidth limits; see the [current Supabase plan quotas](https://supabase.com/docs/guides/platform/billing-on-supabase).
2. In the Supabase SQL Editor, run the complete migration in `supabase/migrations/20261029000000_shared_reports.sql`.
3. In Project Settings → API Keys, copy the project URL and the **publishable** key (or legacy `anon` key). Never copy a `secret` or `service_role` key into a website.
4. Put the URL and publishable key in `shared-config.js`:

   ```js
   window.FINDIT_CONFIG = Object.freeze({
     supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
     supabasePublishableKey: 'sb_publishable_...'
   });
   ```

5. Publish that change to `main`. The Pages workflow builds and checks the site before deployment. The config and publishable key are public source; database grants and policies are the protection.

## What the privacy model does

- The public feed contains only item details, report dates, and photo paths. It has no reporter email or recovery token.
- A 256-bit random recovery token is kept in the browser that created a report. The database stores only its SHA-256 hash. This token authorizes report deletion, photo deletion, and access to that report's inbox messages.
- Message senders provide a reply email and message. Only the report owner's recovery token can read them. The app creates a `mailto:` reply link; it does not send or notify by email.
- If browser storage is cleared, the owner loses access to that report's inbox and remote deletion. Keep the creating browser profile intact.
- Photos in the public bucket are visible to anyone. They are limited to JPEG, PNG, or WebP and 300,000 bytes. Photos are not embedded in QR or share-link payloads.
- Create and message RPCs have per-IP hourly limits. This is a small community demo, not a moderated or abuse-resistant production service. Review public reports and storage usage in the Supabase dashboard.

The frontend uses the public publishable/anon key. Supabase documents that browser keys are public and rely on correctly configured grants and row-level security. Do not expose server-side secret keys. See [Supabase API key guidance](https://supabase.com/docs/guides/getting-started/api-keys), [Row Level Security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

## Try it

1. Open the configured site in browser A and create a report. The report appears on the shared board; keep browser A's site data.
2. Open the same site in browser B/private browsing and find the report.
3. Open the report and send a message with a reply email.
4. Return to browser A and open **My inbox**. Reply using the email link.
5. To remove the report, open it in browser A and choose **Delete this shared report**.

If the config is blank, the app remains in local-demo mode and does not call Supabase.
