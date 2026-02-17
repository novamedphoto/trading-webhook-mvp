export default async function handler(req, res) {

  // =============================
  // METHOD VALIDATION
  // =============================
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // =============================
  // SECRET VALIDATION
  // =============================
  const secret = process.env.WEBHOOK_SECRET;

  const body = typeof req.body === "string"
    ? JSON.parse(req.body || "{}")
    : (req.body || {});

  if (body.secret !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // =============================
  // PRICE INPUT
  // =============================
  const price = Number(body.price || 0);

  if (!price || price <= 0) {
    return res.status(400).json({ error: "Invalid price" });
  }

  // =============================
  // RISK ENGINE (CONFIGURABLE)
  // =============================
  const capital = Number(process.env.DEMO_CAPITAL_USD || 5000);
  const riskPct = Number(process.env.RISK_PCT_PER_TRADE || 1);
  const stopPct = Number(process.env.STOP_PCT || 1); // 1 = 1%

  const riskUsd = capital * (riskPct / 100);

  let stop;

  if (body.side?.toLowerCase() === "buy") {
    stop = price * (1 - stopPct / 100);
  } else if (body.side?.toLowerCase() === "sell") {
    stop = price * (1 + stopPct / 100);
  } else {
    stop = price * (1 - stopPct / 100);
  }

  const stopDistance = Math.abs(price - stop);

  const qty = stopDistance > 0
    ? Math.floor(riskUsd / stopDistance)
    : 0;

  // =============================
  // TELEGRAM ALERT
  // =============================
  try {

    const message = `
📈 Signal Received

Symbol: ${body.symbol}
Side: ${body.side?.toUpperCase()}
Price: ${price}
Stop: ${stop.toFixed(2)}
Qty: ${qty}
Risk USD: ${riskUsd}
Env: ${process.env.ENV || "staging"}
`;

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
        }),
      }
    );

    console.log("Telegram status:", telegramResponse.status);

  } catch (err) {
    console.error("Telegram error:", err);
  }

  // =============================
  // GOOGLE SHEETS LOGGING
  // =============================
  try {

    const sheetsResponse = await fetch(process.env.SHEETS_WEBHOOK_URL, {
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
      redirect: "follow"
    });

    const responseText = await sheetsResponse.text();

    console.log("Sheets status:", sheetsResponse.status);
    console.log("Sheets response:", responseText);

  } catch (err) {
    console.error("Sheets error:", err);
  }

  // =============================
  // FINAL RESPONSE
  // =============================
  return res.status(200).json({
    ok: true,
    symbol: body.symbol,
    side: body.side,
    price,
    stop,
    qty,
    riskUsd
  });
}
