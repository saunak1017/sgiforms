# SGI Forms

An internal Shivani Gems workspace for Customer/Special Jewelry Orders and Vendor Memo In forms. Built for Cloudflare Pages and D1. A small scheduled Worker retries pending submission emails through Resend.

## Start here

1. Follow **CLOUDFLARE_SETUP.md** to create the database, Pages project, and notification Worker.
2. Set the six initial passwords using **BOOTSTRAP_USERS.example.json** as the template for the encrypted Cloudflare secret.
3. Add your Resend API key directly in Cloudflare.
4. Sign in with a first name and assigned password. No first-login password reset is required.

No production credentials are included. The project is coded and tested locally; it has not been deployed to your Cloudflare account.

## Included behavior

- Case-insensitive first-name login for Saunak, Atit, Mehul, Bhavesh, Kyi, and Aye.
- Saunak and Mehul are admins. All six users can create, view, edit, and export forms; admins can delete forms and set team passwords.
- Drafts allow incomplete information. Required-field validation runs when submitting and when editing an already-submitted form.
- Jewelry category reveals the relevant fields. Pendant chain details are conditional on Include Chain. Ring size is required for rings; length, including its unit, for bracelets and necklaces; back type for earrings.
- Multiple metal colors, stone types, and stamping options. Other selections require explanations.
- Stone rows include Center/Side and setting. Shape, quantity, position, and setting are required on each used row; other stone columns are available but optional. No Stones / Metal Only bypasses stone requirements.
- Vendor memo starts with ten rows. Only used rows are required; all seven columns must be completed in each used row. Carat weight belongs in Details. Pricing is entered manually. Jewelry Production entries use a style number in place of the customer and do not require shipping details.
- Order-processing fields are editable over time, with actor/date defaults available. Shipping completion requires tracking and memo/invoice number. Vendor completion has Entered By and Date.
- Dashboard refreshes every 15 seconds. The open editor preserves unsaved work; conflicting saves are rejected with a message so a colleague's changes are not overwritten.
- Search and Draft/In Progress/Completed filters; due-date highlighting; activity history.
- Word (.docx) and SGI PDF downloads include saved form fields, used rows, and processing details. Jewelry orders also provide a one-page manufacturer PDF with only production information. Save before exporting. Long SGI tables span pages; stone/vendor tables use landscape pages.
- Exactly one submission notification event per form, addressed to its fixed group. Draft saves, later edits, completion updates do not create new email events.

## Notifications

| Form           | Recipients                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Jewelry        | saunak@shivanigems.com, atit@shivanigems.com, mehul@shivanigems.com, bhavesh@shivanigems.com, kyi@shivanigems.com |
| Vendor Memo In | saunak@shivanigems.com, atit@shivanigems.com, data@shivanigems.com                                                |

From: **SGI Forms <saunak@shivanigems.com>**. Reply-to: **saunak@shivanigems.com**.

Emails use your two Resend templates, with links to the current form and the original submitted-PDF page. Both links require an office account. The PDF page resumes after sign-in and lets the user choose the SGI PDF or, for jewelry, the manufacturer PDF generated from the immutable first-submission snapshot in D1. Later edits do not change that snapshot. No R2, photo uploads, or PDF file storage is required. Word and PDF exports inside the editor reflect the current saved form.

Submission and email queue insertion happen in the same database batch. The first submission freezes the email payload. Resend idempotency protects retries and the database retains sent state. "Sent" means accepted by Resend, not proof of inbox delivery. Check Resend for delivery/bounce information.

A pending email displays its error. The Worker retries every minute, even with no dashboard open. Admins can also retry a pending message from its form. If an attempted send remains unresolved for 23 hours, it changes to **review** rather than risking a duplicate after Resend's 24-hour idempotency window. See the recovery instructions in the setup guide.

## Password handling

`BOOTSTRAP_USERS_JSON` initializes each matching account on its first successful login. Usernames, emails, and roles are fixed in `src/schema.js`; the secret only supplies initial passwords. Passwords must be 12–256 characters and must not start with the example prefix `REPLACE_`.

Passwords are salted and hashed with PBKDF2-SHA-256 at **100,000 iterations**. Sessions use random opaque tokens, hashed in D1, in HttpOnly/Secure/SameSite cookies and expire after 12 hours. Login attempts are limited per IP/username. Requests that change records require the same origin.

After a user is initialized, changing the bootstrap secret does not reset that account. Use **Manage passwords** as Saunak or Mehul. A reset invalidates the user's active sessions. Remove the bootstrap secret after all six users have signed in at least once (or have been initialized through Manage passwords).

Deletion is a soft delete: the record disappears from the app and cannot be fetched by ordinary API calls; its database record, audit history, and original submission are retained for recovery. Deleted forms and their PDF links are inaccessible until restored.

## Development

Node.js 22.12+ is recommended.

```sh
npm ci
npm run build
npx wrangler d1 migrations apply sgi-forms --local
npm run preview
```

For local login, make a private `.dev.vars` file with `BOOTSTRAP_USERS_JSON` as one line containing your temporary local passwords. It is git-ignored. Do not use production passwords or a live Resend key for automated tests.

```sh
npm test
# Start the local Pages server, then run real API integration checks:
TEST_URL=http://127.0.0.1:8788 npm test
```

The integration test expects local-only Saunak and Atit passwords of `local-test-password-123`. The browser smoke test in `tests/browser.mjs` uses the same local-only credentials; run with `node tests/browser.mjs` against a local server. It writes example records to the local database and exports/screenshots to `../qa`. The bundled Chromium dependency is for these Linux tests, not the app runtime.

## Project map

- `src/main.jsx`, `src/style.css`: responsive forms, dashboard, account management.
- `src/schema.js`: field options, users, recipient groups, validation and normalization.
- `src/export.js`: client-side Word and PDF generation.
- `functions/api/[[path]].js`: authenticated Pages API.
- `server/auth.js`: password hashing and session helpers.
- `server/mail.js`: persisted notification queue and retry logic.
- `server/notification-worker.js`: scheduled queue processor.
- `migrations/0001_init.sql`, `0002_submission_snapshots.sql`: database schema and immutable original submissions.
- `wrangler.jsonc`: Pages bindings.
- `wrangler.notifications.jsonc`: notification Worker bindings and cron.

Cloudflare references: [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/). Resend: [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).
