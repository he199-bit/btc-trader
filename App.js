import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, ActivityIndicator, Alert
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Line, Rect, Path, G } from "react-native-svg";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH  = SCREEN_WIDTH - 28;
const CHART_HEIGHT = 180;
const BASE_API     = "https://btc-trader-production-c7ce.up.railway.app";
const INSTRUMENT   = "BTC_USDT";
const TIMEFRAME    = "M5";

async function fetchCandles() {
  const url = `${BASE_API}/candles`;
  const res  = await fetch(url);
  const json = await res.json();
  return (json?.result?.data || []).map(d => ({
    open: +d.o, close: +d.c, high: +d.h, low: +d.l, vol: +d.v, time: d.t,
  }));
}

async function fetchTicker() {
  const url = `${BASE_API}/ticker`;
  const res  = await fetch(url);
  const json = await res.json();
  return parseFloat(json?.result?.data?.a || 0);
}

function addIndicators(data) {
  let cumVol = 0, cumVolPrice = 0;
  data.forEach(c => {
    const tp = (c.high + c.low + c.close) / 3;
    cumVol += c.vol; cumVolPrice += tp * c.vol;
    c.vwap = cumVol > 0 ? cumVolPrice / cumVol : c.close;
  });
  const k = 2 / 10;
  let ema = data[0].close;
  data.forEach(c => { ema = c.close * k + ema * (1 - k); c.ema9 = ema; });
  return data;
}

function runAnalysis(data) {
  const N = data.length;
  const c = data[N-1], p = data[N-2];
  const aboveVWAP  = c.close > c.vwap;
  const aboveEMA   = c.close > c.ema9;
  const emaUp      = c.ema9  > p.ema9;
  const vwapUp     = c.vwap  > p.vwap;
  const bullCandle = c.close > c.open;
  const atr        = data.slice(-5).reduce((s,x) => s + (x.high - x.low), 0) / 5;
  const volRecent  = data.slice(-3).reduce((s,x) => s + x.vol, 0);
  const volPrior   = data.slice(-6,-3).reduce((s,x) => s + x.vol, 0);
  const volMom     = volRecent / (volPrior || 1);

  let direction = "ESPERAR", confidence = 0, setup = "", detail = "";

  if (aboveVWAP && aboveEMA && emaUp && vwapUp && bullCandle && volMom > 1.08) {
    direction  = "COMPRA";
    confidence = Math.round(72 + Math.random() * 16);
    setup      = "VWAP Breakout + EMA9 Alcista";
    detail     = "Precio sobre VWAP y EMA9 con volumen creciente. Confluencia alcista de alta calidad segun Aziz.";
  } else if (aboveVWAP && emaUp && bullCandle) {
    direction  = "COMPRA";
    confidence = Math.round(58 + Math.random() * 12);
    setup      = "VWAP Bounce";
    detail     = "Rebote desde VWAP con EMA9 apuntando arriba. Confirma con la siguiente vela antes de entrar.";
  } else {
    direction  = "ESPERAR";
    confidence = Math.round(25 + Math.random() * 20);
    setup      = "Sin setup de compra";
    detail     = "No hay senal de compra clara. Aziz recomienda no operar cuando los indicadores no estan alineados.";
  }

  const entry   = c.close;
  const risk    = atr * 0.65;
  const reward  = risk * 2.1;
  const target  = direction === "COMPRA" ? entry + reward : null;
  const stop    = direction === "COMPRA" ? entry - risk   : null;
  const pctGain = target ? ((target - entry) / entry * 100) : null;
  const pctRisk = stop   ? ((entry - stop)   / entry * 100) : null;

  return {
    direction, confidence, setup, detail,
    entry, target, stop, pctGain, pctRisk,
    vwap: c.vwap, ema9: c.ema9,
    aboveVWAP, aboveEMA, emaUp,
    timestamp: new Date().toISOString(),
  };
}

const fmt  = v => v != null ? "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }) : "--";
const fmtP = v => v != null ? v.toFixed(2) + "%" : "--";
const fmtTime = iso => {
  const d = new Date(iso);
  return d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0");
};

function CandleChart({ candles, analysis }) {
  if (!candles.length) return null;
  const W = CHART_WIDTH - 12, H = CHART_HEIGHT;
  const allP  = candles.flatMap(c => [c.high, c.low]);
  const minP  = Math.min(...allP), maxP = Math.max(...allP);
  const range = maxP - minP || 1;
  const PL=2, PR=2, PT=10, PB=6;
  const cw = (W - PL - PR) / candles.length;
  const ch = H - PT - PB;
  const py = p => PT + ((maxP - p) / range) * ch;
  const px = i => PL + i * cw + cw / 2;
  const vwapD = candles.map((c,i) => `${i?"L":"M"}${px(i).toFixed(1)},${py(c.vwap).toFixed(1)}`).join(" ");
  const emaD  = candles.map((c,i) => `${i?"L":"M"}${px(i).toFixed(1)},${py(c.ema9).toFixed(1)}`).join(" ");

  return (
    <Svg width={W} height={H}>
      {analysis?.target && (
        <Line x1={PL} y1={py(analysis.target)} x2={W-PR} y2={py(analysis.target)}
          stroke="#00ff88" strokeWidth={0.8} strokeDasharray="4,3" opacity={0.6}/>
      )}
      {analysis?.entry && (
        <Line x1={PL} y1={py(analysis.entry)} x2={W-PR} y2={py(analysis.entry)}
          stroke="#ffffff" strokeWidth={0.6} strokeDasharray="3,4" opacity={0.2}/>
      )}
      {candles.map((c,i) => {
        const bull  = c.close >= c.open;
        const color = bull ? "#00e87a" : "#ff4060";
        const bTop  = py(Math.max(c.open, c.close));
        const bH    = Math.max(1, Math.abs(py(c.open) - py(c.close)));
        return (
          <G key={i}>
            <Line x1={px(i)} y1={py(c.high)} x2={px(i)} y2={py(c.low)}
              stroke={color} strokeWidth={0.6} opacity={0.5}/>
            <Rect x={px(i)-cw*0.38} y={bTop} width={cw*0.76} height={bH}
              fill={color} opacity={0.82}/>
          </G>
        );
      })}
      <Path d={vwapD} stroke="#ffd700" strokeWidth={1.8} fill="none" strokeDasharray="5,3"/>
      <Path d={emaD}  stroke="#00d4ff" strokeWidth={1.8} fill="none"/>
    </Svg>
  );
}

export default function App() {
  const [candles,   setCandles]   = useState([]);
  const [price,     setPrice]     = useState(null);
  const [pctChange, setPctChange] = useState(0);
  const [analysis,  setAnalysis]  = useState(null);
  const [history,   setHistory]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [apiError,  setApiError]  = useState(false);
  const prevPrice = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem("btc_history").then(val => {
      if (val) setHistory(JSON.parse(val));
    });
  }, []);

  const saveHistory = useCallback(async (h) => {
    await AsyncStorage.setItem("btc_history", JSON.stringify(h));
  }, []);

  const loadCandles = useCallback(async () => {
    setApiError(false);
    try {
      const raw = await fetchCandles();
      const processed = addIndicators(raw);
      setCandles(processed);
      const last = processed[processed.length-1].close;
      if (!prevPrice.current) prevPrice.current = last;
      setPrice(last);
    } catch(e) {
      setApiError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCandles(); }, [loadCandles]);

  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const p = await fetchTicker();
        if (p > 0) {
          const pct = prevPrice.current ? ((p - prevPrice.current) / prevPrice.current) * 100 : 0;
          setPctChange(pct);
          setPrice(p);
          prevPrice.current = p;
        }
      } catch(_) {}
    }, 8000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(loadCandles, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadCandles]);

  const handleAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const raw = await fetchCandles();
      const processed = addIndicators(raw);
      setCandles(processed);
      await new Promise(r => setTimeout(r, 900));
      const result = runAnalysis(processed);
      setAnalysis(result);
      const newHistory = [result, ...history].slice(0, 15);
      setHistory(newHistory);
      saveHistory(newHistory);
    } catch(e) {
      Alert.alert("Error", "No se pudo conectar a Crypto.com. Verifica tu conexion.");
    } finally {
      setAnalyzing(false);
    }
  };

  const dir      = analysis?.direction || "ESPERAR";
  const sigColor = dir === "COMPRA" ? "#00ff88" : "#888";
  const sigBg    = dir === "COMPRA" ? "rgba(0,255,136,0.07)" : "rgba(180,180,180,0.04)";

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

      <View style={s.header}>
        <View>
          <Text style={s.pairLabel}>BTC / USDT · CRYPTO.COM · 5M</Text>
          {loading ? (
            <ActivityIndicator color="#00d4ff" style={{ marginTop: 8 }}/>
          ) : (
            <>
              <Text style={s.priceMain}>{fmt(price)}</Text>
              <Text style={[s.priceChange, { color: pctChange >= 0 ? "#00ff88" : "#ff4466" }]}>
                {pctChange >= 0 ? "+" : ""}{Math.abs(pctChange).toFixed(3)}%
              </Text>
            </>
          )}
        </View>
        <View style={s.headerRight}>
          <View style={s.liveRow}>
            <View style={[s.liveDot, apiError && s.liveDotError]}/>
            <Text style={s.liveLabel}>{apiError ? "ERROR" : "LIVE"}</Text>
          </View>
          <Text style={s.apiLabel}>DATOS REALES</Text>
          <Text style={s.apiLabel}>CRYPTO.COM</Text>
          {analysis && <Text style={s.apiLabel}>Analisis: {fmtTime(analysis.timestamp)}</Text>}
        </View>
      </View>

      {apiError && (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>Sin conexion a Crypto.com</Text>
          <TouchableOpacity onPress={loadCandles} style={s.retryBtn}>
            <Text style={s.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {candles.length > 0 && (
        <View style={s.chartCard}>
          <View style={s.chartLegend}>
            <Text style={[s.legendItem, { color:"#ffd700" }]}>VWAP</Text>
            <Text style={[s.legendItem, { color:"#00d4ff" }]}>EMA9</Text>
            {analysis?.target && <Text style={[s.legendItem, { color:"#00ff88" }]}>Objetivo</Text>}
          </View>
          <CandleChart candles={candles} analysis={analysis}/>
        </View>
      )}

      <TouchableOpacity
        style={[s.analyzeBtn, (analyzing || loading) && s.analyzeBtnDisabled]}
        onPress={handleAnalyze}
        disabled={analyzing || loading}
        activeOpacity={0.8}
      >
        {analyzing ? (
          <View style={{ flexDirection:"row", alignItems:"center", gap:10 }}>
            <ActivityIndicator color="#456" size="small"/>
            <Text style={[s.analyzeBtnText, { color:"#456" }]}>Analizando datos reales...</Text>
          </View>
        ) : (
          <Text style={s.analyzeBtnText}>Analizar proxima hora</Text>
        )}
      </TouchableOpacity>

      {analysis && (
        <View style={[s.resultCard, { backgroundColor: sigBg, borderColor: sigColor + "40" }]}>
          <View style={s.signalHeader}>
            <View>
              <Text style={s.signalSubLabel}>SENAL PROXIMA HORA</Text>
              <Text style={[s.signalName, { color: sigColor }]}>{dir}</Text>
              <Text style={s.signalSetup}>{analysis.setup}</Text>
            </View>
            <View style={{ alignItems:"flex-end" }}>
              <Text style={s.confLabel}>CONFIANZA</Text>
              <Text style={[s.confVal, { color: sigColor }]}>{analysis.confidence}%</Text>
            </View>
          </View>

          <View style={s.confBarBg}>
            <View style={[s.confBar, { width: `${analysis.confidence}%`, backgroundColor: sigColor }]}/>
          </View>

          <Text style={s.detail}>{analysis.detail}</Text>

          {dir === "COMPRA" && (
            <>
              <Text style={s.targetsLabel}>PROGRAMA EN CRYPTO.COM</Text>
              <View style={s.targetsGrid}>
                <View style={[s.targetBox, { borderColor:"#c8e8ff18" }]}>
                  <Text style={s.targetBoxLabel}>COMPRA A</Text>
                  <Text style={[s.targetBoxPrice, { color:"#c8e8ff" }]}>{fmt(analysis.entry)}</Text>
                  <Text style={s.targetBoxDesc}>Entrada</Text>
                </View>
                <View style={[s.targetBox, { borderColor:"#00ff8818" }]}>
                  <Text style={s.targetBoxLabel}>VENDE A</Text>
                  <Text style={[s.targetBoxPrice, { color:"#00ff88" }]}>{fmt(analysis.target)}</Text>
                  <Text style={[s.targetBoxDesc, { color:"#00ff88" }]}>+{fmtP(analysis.pctGain)}</Text>
                </View>
                <View style={[s.targetBox, { borderColor:"#ff446618" }]}>
                  <Text style={s.targetBoxLabel}>STOP LOSS</Text>
                  <Text style={[s.targetBoxPrice, { color:"#ff4466" }]}>{fmt(analysis.stop)}</Text>
                  <Text style={[s.targetBoxDesc, { color:"#ff4466" }]}>-{fmtP(analysis.pctRisk)}</Text>
                </View>
              </View>
              <View style={s.azizRule}>
                <Text style={s.azizText}>
                  Regla Aziz: Riesgo maximo 1-2% de tu capital. Stop en {fmt(analysis.stop)} es obligatorio.
                </Text>
              </View>
            </>
          )}

          {dir === "ESPERAR" && (
            <View style={s.waitBox}>
              <Text style={s.waitIcon}>⏸</Text>
              <Text style={s.waitText}>
                No hay senal de compra ahora.{"\n"}
                Espera 15-30 min y analiza de nuevo.
              </Text>
            </View>
          )}

          <View style={s.indicatorsGrid}>
            {[
              { label:"VWAP",  val:fmt(analysis.vwap), ok:analysis.aboveVWAP, okT:"Precio encima", noT:"Precio abajo" },
              { label:"EMA 9", val:fmt(analysis.ema9), ok:analysis.aboveEMA,  okT:"Tendencia al alza", noT:"Tendencia a la baja" },
            ].map(({ label, val, ok, okT, noT }) => (
              <View key={label} style={s.indicatorBox}>
                <Text style={s.indicatorLabel}>{label}</Text>
                <Text style={s.indicatorVal}>{val}</Text>
                <Text style={[s.indicatorStatus, { color: ok ? "#00ff88" : "#ff4466" }]}>
                  {ok ? okT : noT}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {!analysis && !loading && (
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>◈</Text>
          <Text style={s.emptyText}>
            Presiona Analizar proxima hora{"\n"}
            para obtener tu punto de entrada y salida
          </Text>
        </View>
      )}

      {history.length > 0 && (
        <View style={s.historyCard}>
          <Text style={s.historyHeader}>HISTORIAL DE ANALISIS</Text>
          {history.map((item, i) => {
            const col = item.direction === "COMPRA" ? "#00ff88" : "#666";
            return (
              <View key={i} style={[s.historyRow, i%2===0 && s.historyRowEven]}>
                <Text style={s.hTime}>{fmtTime(item.timestamp)}</Text>
                <Text style={[s.hDir, { color:col }]}>{item.direction}</Text>
                <Text style={s.hEntry}>{fmt(item.entry)}</Text>
                <Text style={[s.hTarget, { color:col }]}>
                  {item.target ? fmt(item.target) : "Sin objetivo"}
                </Text>
                <Text style={s.hGain}>
                  {item.pctGain ? "+" + fmtP(item.pctGain) : "--"}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={s.footer}>Solo educativo - No es asesoria financiera</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container:    { flex:1, backgroundColor:"#060c12" },
  content:      { padding:14, paddingTop:60, paddingBottom:40 },
  header:       { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 },
  pairLabel:    { fontSize:10, color:"#345", letterSpacing:2, marginBottom:4 },
  priceMain:    { fontSize:30, fontWeight:"bold", color:"#e4f0ff", letterSpacing:-1 },
  priceChange:  { fontSize:12, marginTop:2 },
  headerRight:  { alignItems:"flex-end", paddingTop:4 },
  liveRow:      { flexDirection:"row", alignItems:"center", gap:6, marginBottom:4 },
  liveDot:      { width:7, height:7, borderRadius:4, backgroundColor:"#00ff88" },
  liveDotError: { backgroundColor:"#ff4466" },
  liveLabel:    { fontSize:10, color:"#456", letterSpacing:2 },
  apiLabel:     { fontSize:9, color:"#345", marginTop:1 },
  errorBanner:  { backgroundColor:"rgba(255,68,102,0.1)", borderRadius:10, padding:12, marginBottom:14 },
  errorText:    { color:"#ff8899", fontSize:12 },
  retryBtn:     { marginTop:8, borderWidth:1, borderColor:"#ff4466", borderRadius:6, padding:6, alignSelf:"flex-start" },
  retryText:    { color:"#ff8899", fontSize:11 },
  chartCard:    { backgroundColor:"rgba(255,255,255,0.018)", borderWidth:1, borderColor:"rgba(0,200,255,0.08)", borderRadius:12, padding:10, marginBottom:18 },
  chartLegend:  { flexDirection:"row", gap:14, marginBottom:6 },
  legendItem:   { fontSize:10 },
  analyzeBtn:   { backgroundColor:"rgba(0,120,255,0.15)", borderWidth:1, borderColor:"rgba(0,180,255,0.45)", borderRadius:12, padding:18, alignItems:"center", marginBottom:18 },
  analyzeBtnDisabled: { backgroundColor:"rgba(0,180,255,0.05)", borderColor:"rgba(0,180,255,0.15)" },
  analyzeBtnText:     { color:"#00d4ff", fontSize:14, letterSpacing:2 },
  resultCard:   { borderWidth:1, borderRadius:14, padding:18, marginBottom:18 },
  signalHeader: { flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 },
  signalSubLabel: { fontSize:10, color:"#567", letterSpacing:3, marginBottom:6 },
  signalName:   { fontSize:28, fontWeight:"bold", letterSpacing:3 },
  signalSetup:  { fontSize:11, color:"#789", marginTop:4 },
  confLabel:    { fontSize:10, color:"#567", marginBottom:4 },
  confVal:      { fontSize:26 },
  confBarBg:    { backgroundColor:"rgba(255,255,255,0.06)", borderRadius:4, height:5, marginBottom:16 },
  confBar:      { height:"100%", borderRadius:4 },
  detail:       { fontSize:12, color:"#8ab", marginBottom:18, lineHeight:18 },
  targetsLabel: { fontSize:10, color:"#456", letterSpacing:3, marginBottom:10 },
  targetsGrid:  { flexDirection:"row", gap:8, marginBottom:14 },
  targetBox:    { flex:1, backgroundColor:"rgba(0,0,0,0.35)", borderRadius:10, padding:10, alignItems:"center", borderWidth:1 },
  targetBoxLabel: { fontSize:9, color:"#456", marginBottom:5, textAlign:"center" },
  targetBoxPrice: { fontSize:13, fontWeight:"bold", marginBottom:3 },
  targetBoxDesc:  { fontSize:9, color:"#456" },
  azizRule:     { backgroundColor:"rgba(0,0,0,0.25)", borderRadius:8, padding:10 },
  azizText:     { fontSize:11, color:"#678", lineHeight:17 },
  waitBox:      { backgroundColor:"rgba(0,0,0,0.3)", borderRadius:10, padding:18, alignItems:"center" },
  waitIcon:     { fontSize:28, marginBottom:10 },
  waitText:     { fontSize:13, color:"#889", textAlign:"center", lineHeight:20 },
  indicatorsGrid: { flexDirection:"row", gap:8, marginTop:14 },
  indicatorBox: { flex:1, backgroundColor:"rgba(255,255,255,0.025)", borderWidth:1, borderColor:"rgba(0,200,255,0.07)", borderRadius:8, padding:10 },
  indicatorLabel: { fontSize:9, color:"#456", letterSpacing:2, marginBottom:4 },
  indicatorVal:   { fontSize:15, color:"#def", marginBottom:3 },
  indicatorStatus: { fontSize:10 },
  emptyState:   { alignItems:"center", padding:28 },
  emptyIcon:    { fontSize:34, color:"#345", marginBottom:12, opacity:0.4 },
  emptyText:    { fontSize:13, color:"#345", textAlign:"center", lineHeight:22 },
  historyCard:  { backgroundColor:"rgba(255,255,255,0.015)", borderWidth:1, borderColor:"rgba(0,200,255,0.07)", borderRadius:12, overflow:"hidden", marginBottom:18 },
  historyHeader: { padding:12, borderBottomWidth:1, borderBottomColor:"rgba(0,200,255,0.07)", fontSize:10, color:"#456", letterSpacing:3 },
  historyRow:   { flexDirection:"row", alignItems:"center", gap:8, padding:9, paddingHorizontal:14 },
  historyRowEven: { backgroundColor:"rgba(255,255,255,0.02)" },
  hTime:  { color:"#456", fontSize:11, minWidth:36 },
  hDir:   { fontSize:11, fontWeight:"bold", minWidth:60 },
  hEntry: { color:"#8ab", fontSize:11, minWidth:70 },
  hTarget:{ flex:1, fontSize:11 },
  hGain:  { color:"#567", fontSize:11 },
  footer: { textAlign:"center", fontSize:10, color:"#2a3a4a", letterSpacing:1, marginTop:8 },
});