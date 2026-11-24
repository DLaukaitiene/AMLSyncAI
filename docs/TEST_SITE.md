# Test site: testapp2.amlsync.com

A full copy of the AMLSync App for checking changes before they go live. It runs on its own
Vercel project and its **own database**, so nothing done there can touch live firms or clients.

| | Test site | Live app |
|---|---|---|
| Address | https://testapp2.amlsync.com | https://app.amlsync.com |
| Git branch | `staging` | `main` |
| Vercel project | `amlsyncai-testapp2` | `amlsyncai` |
| Database (Supabase, Frankfurt) | `amlsyncai-testapp2` | `amlsyncai-test` (despite its name, this is the live database) |
| Email | Not sent: stored in the test mailbox (`/dev/mailbox?token=…`, token = `DEV_MAILBOX_TOKEN` in the Vercel project) | Real email (SMTP) |
| Search engines | Blocked (`SITE_NOINDEX=1`) | Public pages indexed |
| Didit / AI drafting | Off until a sandbox key is added | Live keys |

The test site uses its own `MASTER_KEY`, `CRON_SECRET` and `BACKUP_KEY`, and different database passwords.
Live data cannot be read there, even if it is copied over.

## Workflow

1. Changes are pushed to `staging`. Vercel builds testapp2 automatically, runs the database
   migrations on the **test** database and publishes the result at testapp2.amlsync.com.
2. Check everything on testapp2.
3. When approved, merge `staging` into `main`. The live app then builds, migrates the live database and goes live.

```bash
git checkout main && git pull && git merge --ff-only origin/staging && git push origin main
```

## Optional settings (Vercel → amlsyncai-testapp2 → Settings → Environment Variables)

- `DIDIT_API_KEY` (a `sk_test_…` sandbox key) and `DIDIT_WEBHOOK_SECRET`: identity checks in test mode.
  Webhook URL: `https://testapp2.amlsync.com/api/webhooks/didit`.
- `SMTP_URL` and `EMAIL_TRANSPORT=smtp`: send real emails instead of using the test mailbox.
- `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`: AI drafting.
