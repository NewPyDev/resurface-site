// api/check-subscription.js
//
// Called by the Chrome extension to check "is this email currently paid?"
// GET /api/check-subscription?email=someone@example.com -> { active: true }

const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

module.exports = async (req, res) => {
  const email = (req.query.email || "").toLowerCase().trim();

  if (!email) {
    res.status(400).json({ error: "Missing email" });
    return;
  }

  const record = await redis.get(`sub:${email}`);

  // Basic CORS so the extension (running from a chrome-extension:// origin)
  // can call this endpoint directly.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ active: Boolean(record && record.active) });
};
