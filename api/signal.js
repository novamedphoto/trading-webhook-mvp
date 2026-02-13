export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.WEBHOOK_SECRET;

  const body = req.body || {};

  if (body.secret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const price = Number(body.price || 0);
  const capital = 5000;
  const riskPct = 1;

  const riskUsd = capital * (riskPct / 100);
  const stop = price * 0.99;
  const stopDistance = price - stop;

  const qty = Math.floor(riskUsd / stopDistance);

  return res.status(200).json({
    ok: true,
    symbol: body.symbol,
    side: body.side,
    price,
    qty,
    riskUsd
  });
}
