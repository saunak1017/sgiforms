# Cloudflare setup for SGI Forms

Use a new Pages project and a new D1 database for this app. Do not point it at the existing SGI Production database.

## 1. Put the source in your repository

Extract the ZIP. Upload the contents of `sgi-forms` to a new GitHub repository. Keep `package.json`, `functions`, `src`, and both Wrangler configuration files at the repository root. Include the lockfile, migrations, and public folder.

Do not upload passwords, `.dev.vars`, `node_modules`, `.wrangler`, or test-generated files. The template JSON contains placeholders only; never commit a filled-in copy.

## 2. Create D1

In Cloudflare, create:

- D1 database: `sgi-forms`.

Copy the D1 database ID. Replace `REPLACE_WITH_D1_DATABASE_ID` in **both** `wrangler.jsonc` and `wrangler.notifications.jsonc`, then commit those changes.

You can create these resources with Wrangler instead:

```sh
npm ci
npx wrangler login
npx wrangler d1 create sgi-forms
```

The D1 ID is configuration, not a password.

## 3. Initialize the database

After replacing the ID, run:

```sh
npx wrangler d1 migrations apply sgi-forms --remote
```

Alternatively, paste and execute the contents of `migrations/0001_init.sql`, then `migrations/0002_submission_snapshots.sql`, in that order in the new database's Cloudflare SQL console. Use one initialization method. Both files use `CREATE TABLE IF NOT EXISTS`.

## 4. Create the Pages project

Cloudflare → Workers & Pages → create a **Pages** project → connect the GitHub repository.

| Setting | Value |
| --- | --- |
| Project name | `sgi-forms` (or your choice) |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Repository root |
| Node version environment variable | `NODE_VERSION=22` |

The checked-in `wrangler.jsonc` configures the D1 binding **DB**. The name is case-sensitive. Verify it under the project's bindings after deployment. If you change resource names, update the config to match.

Use Git integration or `wrangler pages deploy` for this app. Uploading only the `dist` folder through the dashboard's drag-and-drop uploader does not include the source Pages Functions API.

## 5. Add the Pages secrets

In the Pages project → Settings → Variables and Secrets, add encrypted secrets for the **Production** environment:

| Secret | Value |
| --- | --- |
| `BOOTSTRAP_USERS_JSON` | Completed JSON from the example below |
| `RESEND_API_KEY` | Your Resend sending API key |

Use Encrypt / Secret, not a public frontend variable. Nothing starts with `VITE_`.

Copy `BOOTSTRAP_USERS.example.json`, replace every password placeholder with a unique password of 12–256 characters, and paste the entire JSON array into the Cloudflare secret. Do not add outer quotation marks around the array. Preserve the commas and double quotes. These passwords are assigned by you and work immediately, with no forced first-login reset.

```json
[
  {"username":"saunak","password":"REPLACE_WITH_SAUNAK_PASSWORD"},
  {"username":"atit","password":"REPLACE_WITH_ATIT_PASSWORD"},
  {"username":"mehul","password":"REPLACE_WITH_MEHUL_PASSWORD"},
  {"username":"bhavesh","password":"REPLACE_WITH_BHAVESH_PASSWORD"},
  {"username":"kyi","password":"REPLACE_WITH_KYI_PASSWORD"},
  {"username":"aye","password":"REPLACE_WITH_AYE_PASSWORD"}
]
```

Redeploy after adding the secrets. Sign in as Saunak or Mehul. They are the two admins; Atit, Bhavesh, Kyi, and Aye are staff.

Accounts are initialized individually on their first correct login. Keep the bootstrap secret until all six accounts are initialized, or initialize the remaining accounts from Manage passwords. Then remove the bootstrap secret and redeploy. Future resets happen in Manage passwords, not by editing the bootstrap JSON.

For preview deployments, use separate test resources and passwords. Do not add the live Resend key to Preview unless you deliberately want preview submissions to notify the office.

## 6. Check Resend

The sending domain must permit `saunak@shivanigems.com`. The API key needs sending permission for that domain. The sender and recipient groups are already configured in the source; the code uses these template IDs directly:

| Form | Template ID |
| --- | --- |
| Jewelry | `4c51a6ad-454e-4b17-88c7-0a452db79009` |
| Vendor Memo In | `270f9fce-3f7a-454e-80b3-dac8a66ed3b4` |

Publish both templates in Resend before testing. Define these variables as String variables with exactly these uppercase names. The application supplies all values automatically; you do not enter values for each submission.

- Jewelry: `CUSTOMER`, `STYLE_NUMBER`, `CATEGORY`, `SALESPERSON`, `MANUFACTURER`, `DUE_DATE`, `QUANTITY`, `PRICE_SUMMARY`, `SUBMITTED_BY`, `FORM_REFERENCE`, `FORM_URL`, `PDF_URL`.
- Vendor: `VENDOR_NAME`, `CUSTOMER`, `SUBMITTED_BY`, `FORM_REFERENCE`, `FORM_URL`, `PDF_URL`.

Remove unused required variables left over from earlier drafts, or give them fallback values. The application sets the email subject. For clickable buttons, use `{{{FORM_URL}}}` and `{{{PDF_URL}}}` as their link destinations. The PDF link requires login and automatically downloads the original submitted version, with a manual download button if needed. The current form stays editable. No photos or R2 setup is included.

Pages saves each submission first, then attempts the email. If the key is absent or sending fails, the form remains saved and the notification remains queued.

## 7. Deploy the notification Worker

This small Worker retries queued submission emails every minute. It uses the same D1 database as Pages. It does not send emails for edits or processing changes.

From the repository folder:

```sh
npx wrangler deploy --config wrangler.notifications.jsonc
npx wrangler secret put RESEND_API_KEY --config wrangler.notifications.jsonc
```

Paste the same Resend API key at the secret prompt. You can instead add it in the deployed Worker's **runtime Variables and Secrets** panel. Build variables and GitHub variables are not substitutes for the runtime secret.

Confirm the Worker has:

- D1 binding **DB**, connected to the new `sgi-forms` database.
- Runtime secret **RESEND_API_KEY**.
- Cron schedule **`* * * * *`**.

The Worker does not need BOOTSTRAP_USERS_JSON.

## 8. Verify the deployed app

1. Sign in with a first name and its assigned password.
2. Save an incomplete draft. It should not email anyone.
3. Complete a clearly labeled test form and submit once. This WILL notify that form's real recipient group.
4. Confirm the email status is Sent and check the Resend delivery log.
5. Edit a processing field and save. No second email should be sent.
6. Download Word and PDF exports. Open both email links, including after signing out. Edit the current form and confirm the submitted PDF still shows the original values.
7. Open the dashboard in a second account; changes should appear within 15 seconds.
8. Verify that staff accounts do not have Delete or Manage passwords controls.

The code has local workflow tests. Real Cloudflare deployment and real Resend delivery still need this check using your account and API key.

## Troubleshooting

**BOOTSTRAP_USERS_JSON must be valid JSON**: paste the full array from the template with real passwords. No trailing commas. No outer quotes around the array.

**Invalid username or password**: first names are case-insensitive. Passwords are case-sensitive. Placeholder passwords beginning `REPLACE_` are rejected. If an account already exists, use the admin reset screen; changing the bootstrap secret does not replace its password.

**D1 binding DB is missing / request failed**: verify the database ID, binding name, both migrations, and redeploy. Inspect Pages Functions logs for details.


**Email pending**: the form is saved. Check `RESEND_API_KEY` in both Pages and the Worker's runtime settings, domain verification, key permissions, and the message displayed on the form. Retry after correcting configuration. Do not resubmit a new form just to send the email.

**Email review**: an attempted send remained unresolved beyond the safe retry window. Check Resend logs using the form reference and recipients before doing anything. If it was accepted, an administrator with database access can mark the outbox row as sent and record its Resend ID. If you confirm it was never accepted, clear `first_attempt` and `lease_until`, and set `status` to `pending` for that one `record_id` in the D1 console. Do not reset a row unless you have verified it was not sent; the next Worker run can send it.

**Someone updated this form**: your local edits remain on screen. Copy any changes you need, reopen the saved form to load the latest version, then apply and save. This avoids overwriting a colleague's work.

**Export controls disabled**: save pending changes first. Export always reflects the saved version.

**Deleted form recovery**: admins can restore it through the D1 console by setting `deleted=0` for its exact record ID. The UI intentionally confirms deletion and hides deleted forms.
