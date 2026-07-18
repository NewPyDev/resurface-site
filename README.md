# Resurface Webhook — Vercel version

Two serverless functions that plug into your existing Vercel project
(the same one hosting your pricing/legal pages):

- `api/paddle-webhook.js` — receives Paddle's events, verifies they're real,
  and stores subscription status.
- `api/check-subscription.js` — the extension calls this to check "is this
  email paid?"

## 1. Add these files to your existing repo

Copy the `api/` folder and `package.json` into the same GitHub repo as your
pricing/legal pages (the one already connected to Vercel). If you already
have a `package.json` there, merge the `dependencies` instead of
overwriting it.

## 2. Add a free Redis database (Upstash, via Vercel's own Marketplace)

1. In your Vercel dashboard, open your project.
2. Go to the **Storage** tab (or **Integrations** → Marketplace).
3. Find **Upstash** (Redis) and add it — free tier is enough for this.
4. Vercel will automatically add the right environment variables
   (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) to your project.
   You don't need to copy these yourself.

## 3. Set your Paddle webhook secret

In Vercel project settings → Environment Variables, add:
- `PADDLE_WEBHOOK_SECRET` — the signing secret Paddle gives you when you
  create a notification destination (Developer tools > Notifications).
  It's only shown once — copy it immediately when created.

Redeploy after adding this so the function picks it up.

## 4. Point Paddle at your webhook

In Paddle: Developer tools > Notifications > Create destination.
- URL: `https://your-site.vercel.app/api/paddle-webhook`
- Subscribe to: `subscription.created`, `subscription.activated`,
  `subscription.updated`, `subscription.resumed`, `subscription.canceled`,
  `subscription.paused`, `subscription.past_due`

## 5. Check it's working

```
GET https://your-site.vercel.app/api/check-subscription?email=someone@example.com
```
Should return `{ "active": false }` until that email has a real active
subscription recorded via a webhook event.

## Why this is better than the Bot-hosting.net version

Vercel's serverless functions don't have a persistent local filesystem —
each request can run on a different machine — so a JSON file (like the
Bot-hosting.net version used) wouldn't reliably survive between requests.
Upstash Redis solves that properly: it's a real managed database, so a
redeploy or restart won't wipe anyone's subscription status.
