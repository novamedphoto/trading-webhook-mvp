export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const secret = process.env.WEBHOOK_SECRET;

  const body = typeof req.body === "string"
    ? JSON.parse(req.body || "{}")
    : (req.body || {});

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

  // --- TELEGRAM ALERT ---
  try {
    const message = `
📈 Signal Received

Symbol: ${body.symbol}
Side: ${body.side?.toUpperCase()}
Price: ${price}
Qty: ${qty}
Risk USD: ${riskUsd}
Env: ${process.env.ENV || "staging"}
`;

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    });

    console.log("Telegram sent");
  } catch (err) {
    console.error("Telegram error:", err);
  }

  // --- GOOGLE SHEETS LOGGING ---
  try {
    await fetch(process.env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        env: process.env.ENV || "staging",
        symbol: body.symbol,
        side: body.side,
        entry_price: price,
        stop_price: stop,
        qty: qty,
        risk_usd: riskUsd,
        stop_distance: stopDistance,
        notes: ""
      }),
    });

    console.log("Sheets logged");
  } catch (err) {
    console.error("Sheets error:", err);
  }

  return res.status(200).json({
    ok: true,
    symbol: body.symbol,
    side: body.side,
    price,
    qty,
    riskUsd
  });
}
