export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {

    const secret = process.env.WEBHOOK_SECRET;

    const body = typeof req.body === "string"
      ? JSON.parse(req.body || "{}")
      : (req.body || {});

    if (body.secret !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // =============================
    // NORMALIZAR INPUT
    // =============================
    const symbol = String(body.symbol || "").toUpperCase();
    const side = String(body.side || "").toUpperCase();
    const price = Number(body.price || 0);

    if (!symbol || !side || !price) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    // =============================
    // RISK CONFIG (desde ENV)
    // =============================
    const capital = Number(process.env.DEMO_CAPITAL_USD || 5000);
    const riskPct = Number(process.env.RISK_PCT_PER_TRADE || 1);

    const riskUsd = capital * (riskPct / 100);

    // =============================
    // STOP LOGIC BUY / SELL
    // =============================
    let stop;
    let stopDistance;

    if (side === "BUY") {
      stop = price * 0.99; // 1% debajo
      stopDistance = price - stop;
    } 
    else if (side === "SELL") {
      stop = price * 1.01; // 1% encima
      stopDistance = stop - price;
    } 
    else {
      return res.status(400).json({ error: "Invalid side. Must be BUY or SELL" });
    }

    if (stopDistance <= 0) {
      return res.status(400).json({ error: "Invalid stop distance" });
    }

    const qty = Math.floor(riskUsd / stopDistance);

    if (qty <= 0) {
      return res.status(400).json({ error: "Position size too small" });
    }

    // =============================
    // TELEGRAM ALERT
    // =============================
    try {

      const message = `
📈 Signal Received

Symbol: ${symbol}
Side: ${side}
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
          symbol: symbol,
          side: side,
          entry_price: price,
          stop_price: Number(stop.toFixed(2)),
          qty: qty,
          risk_usd: riskUsd,
          stop_distance: Number(stopDistance.toFixed(2)),
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
      symbol,
      side,
      price,
      stop: Number(stop.toFixed(2)),
      qty,
      riskUsd
    });

  } catch (err) {

    console.error("Fatal error:", err);

    return res.status(500).json({
      error: "Internal Server Error",
      details: err.message
    });
  }
}
