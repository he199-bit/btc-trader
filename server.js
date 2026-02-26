const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const app = express();

app.use(cors());

app.get("/candles", async (req, res) => {
  try {
    const url = "https://api.crypto.com/exchange/v1/public/get-candlestick?instrument_name=BTC_USDT&timeframe=M5&count=80";
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Error fetching candles" });
  }
});

app.get("/ticker", async (req, res) => {
  try {
    const url = "https://api.crypto.com/exchange/v1/public/get-ticker?instrument_name=BTC_USDT";
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: "Error fetching ticker" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Proxy corriendo en puerto " + PORT));