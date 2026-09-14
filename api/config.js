module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    freeDailyLimit: Number(process.env.FREE_DAILY_LIMIT || 10),
    premiumPrice: process.env.PREMIUM_PRICE || "499 PKR/month"
  });
};
