// api/paddle-webhook.js
//
// Vercel serverless function. Receives Paddle webhook events, verifies they
// really came from Paddle, and records subscription status in Upstash Redis
// (so it survives restarts/redeploys — unlike a local JSON file would here).

const crypto = require("crypto");
const { Redis } = require("@upstash/redis");

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env vars,
// which Vercel auto-injects once you add the Upstash integration.
const redis = Redis.fromEnv();

// We need the raw, unparsed body to verify Paddle's signature, so we
// disable Vercel's automatic body parsing for this function.
module.exports.config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(";").map((p) => p.split("="))
  );
  const ts = parts.ts;
  const receivedH1 = parts.h1;
  if (!ts || !receivedH1) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${ts}:${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(receivedH1, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const rawBody = await getRawBody(req);
  const signatureHeader = req.headers["paddle-signature"];
  const secret = process.env.PADDLE_WEBHOOK_SECRET;

  if (!verifyPaddleSignature(rawBody, signatureHeader, secret)) {
    console.warn("Rejected webhook: invalid or missing signature");
    res.status(401).send("Invalid signature");
    return;
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    res.status(400).send("Bad JSON");
    return;
  }

  const eventType = event?.event_type;
  const data = event?.data;
  const email = data?.customer?.email || data?.customer_email;

  if (!email) {
    console.warn(`Webhook ${eventType} had no email, ignoring`);
    res.status(200).send("OK (no email, ignored)");
    return;
  }

  const key = `sub:${email.toLowerCase().trim()}`;

  const activeEvents = [
    "subscription.created",
    "subscription.activated",
    "subscription.updated",
    "subscription.resumed",
  ];
  const inactiveEvents = [
    "subscription.canceled",
    "subscription.paused",
    "subscription.past_due",
  ];

  if (activeEvents.includes(eventType)) {
    await redis.set(key, { active: true, updatedAt: new Date().toISOString() });
  } else if (inactiveEvents.includes(eventType)) {
    await redis.set(key, { active: false, updatedAt: new Date().toISOString() });
  } else {
    console.log(`Unhandled event type: ${eventType}`);
  }

  res.status(200).send("OK");
};
