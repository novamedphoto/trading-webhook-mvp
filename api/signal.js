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

    const price = Number(body.price || 0);
    if (!price || price <= 0) {
      return res.status(400).json({ error: "Invalid price" });
    }

    // =============================
    // 🔹 EQUITY DINÁMICO
    // =============================

    const baseCapital = Number(process.env.DEMO_CAPITAL_USD || 5000);
    const riskPct = Number(process.env.RISK_PCT_PER_TRADE || 1);

    let totalPnl = 0;

    try {
      const equityResponse = await fetch(
        `${process.env.SHEETS_WEBHOOK_URL}?action=get_equity`
      );

      const equityData = await equityResponse.json();
      totalPnl = Number(equityData.total_pnl || 0);

    } catch (err) {
      console.error("Equity fetch error:", err);
      totalPnl = 0; // fallback
    }

    const equity = baseCapital + totalPnl;

    if (equity <= 0) {
      return res.status(500).json({ error: "Equity invalid" });
    }

    const riskUsd = equity * (riskPct / 100);

    // =============================
    // 🔹 STOP / TP
    // =============================

    let stop;
    let takeProfit;

    if (body.side?.toLowerCase() === "sell") {
      stop = price * 1.01;
      const stopDistance = stop - price;
      takeProfit = price - (stopDistance * 2);
    } else {
      stop = price * 0.99;
      const stopDistance = price - stop;
      takeProfit = price + (stopDistance * 2);
    }

    const stopDistance = Math.abs(price - stop);
    const qty = Math.floor(riskUsd / stopDistance);

    // =============================
    // 🔹 TELEGRAM
    // =============================

    try {
      const message = `
📈 Signal Received

Symbol: ${body.symbol}
Side: ${body.side?.toUpperCase()}
Price: ${price}
Equity: ${equity.toFixed(2)}
Risk USD: ${riskUsd.toFixed(2)}
Qty: ${qty}
Stop: ${stop.toFixed(2)}
Take Profit: ${takeProfit.toFixed(2)}
`;

      await fetch(
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

    } catch (err) {
      console.error("Telegram error:", err);
    }

    // =============================
    // 🔹 SHEETS LOGGING
    // =============================

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
          take_profit: takeProfit,
          qty: qty,
          risk_usd: riskUsd,
          stop_distance: stopDistance,
          notes: ""
        })
      });

    } catch (err) {
      console.error("Sheets error:", err);
    }

    return res.status(200).json({
      ok: true,
      equity,
      riskUsd,
      qty
    });

  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}
