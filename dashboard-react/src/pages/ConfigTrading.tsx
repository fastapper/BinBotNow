// dashboard-react/src/pages/ConfigTrading.tsx
import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Checkbox } from "../components/common/Checkbox";

type TradingMethod = "RSI" | "EMA" | "MACD" | "SMART";

interface TokenConfig {
  symbol: string;
  method: TradingMethod;
  params: {
    rsiPeriod?: string;
    rsiOverbought?: string;
    rsiOversold?: string;
    emaShort?: string;
    emaLong?: string;
    macdFast?: string;
    macdSlow?: string;
    macdSignal?: string;
  };
  maxOrder?: string;
  maxOpenOrders?: string;
  maxExposure?: string;
  sl?: string;
  tp?: string;

 // === 👇 Nuevos campos para SmartTrading ===
  smart_config?: Record<string, any>; // Configuración enviada al backend
  trainingProgress?: number;          // Barra de progreso (%)
  manifestPath?: string;              // Path del manifest generado
  lastTrainedAt?: string;             // Timestamp de último entrenamiento
  formulas?: {
    best_by_accuracy: string[];
    best_by_profit: string[];
    best_balanced: string[];
  };
  lastPingAt?: string;                // Para mostrar si el WS sigue vivo
}


interface SmartConfig {
  dataPath: string;
  timeframe: string;
  outdir: string;
  minAccuracy: string;
  minProfit: string;
  profitTarget: string;
  stopLoss: string;
  deltaT: string;
  trailingEnabled: boolean;
  trailingDistance: string;
  maxCombinations: string;
  manifestPath?: string;
  activeFormula?: "best_by_accuracy" | "best_by_profit" | "best_balanced";

  // 🔹 Nuevos campos
  trainingProgress?: number;    // porcentaje 0–100
  lastTrainedAt?: string;       // fecha/hora ISO del último entrenamiento
  formulas?: {
    best_by_accuracy?: any;
    best_by_profit?: any;
    best_balanced?: any;
  };
}


const wsCache: Record<string, WebSocket> = {}; // cache por símbolo

const Wrap = styled.div`
  padding: 16px;
  height: 100%;
  overflow-y: auto;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
`;

const PairCard = styled.div`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  display: flex;
  flex-direction: column;
  padding: 12px;
  min-height: 520px;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 1rem;
  margin-bottom: 12px;
  text-align: center;
`;

const PairSelectWrap = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 8px;
  margin-bottom: 12px;
`;

const StyledSelect = styled(Select)`
  font-size: 1rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 6px 10px;
`;

const Section = styled.div`
  background: ${({ theme }) => theme.colors.panelAlt || theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px 10px;
  margin-bottom: 10px;
`;

const SectionTitle = styled.div`
  font-size: 0.9rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textSoft};
  margin-bottom: 6px;
`;


const ConfigTrading: React.FC = () => {
  const [allPairs, setAllPairs] = useState<string[]>([]);
  const [configs, setConfigs] = useState<Record<number, TokenConfig>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
const init = async () => {
  try {
    const statusRes = await fetch("http://127.0.0.1:8080/status");
    const statusData = await statusRes.json();
    const syms = statusData.symbols || [];
    setAllPairs(syms);

    const cfgRes = await fetch("http://127.0.0.1:8080/config/trading");
    const saved = await cfgRes.json();

    const initConfigs: Record<number, TokenConfig> = {};

    // 🔹 Default Smart config
    const defaultSmart: SmartConfig = {
      dataPath: "data/ohlcv.csv",
      timeframe: "1h",
      outdir: "artifacts",
      minAccuracy: "0.7",
      minProfit: "0.05",
      profitTarget: "0.1",
      stopLoss: "0.05",
      deltaT: "60",
      trailingEnabled: true,
      trailingDistance: "0.01",
      maxCombinations: "200",
      trainingProgress: undefined,
      lastTrainedAt: undefined,
      manifestPath: undefined,
      activeFormula: undefined,
      formulas: {},
    };

    // 🚀 Mergeamos saved con defaults y smart
    for (let i = 0; i < 10; i++) {
      const savedCfg = saved[i] || {};
      initConfigs[i] = {
        symbol: savedCfg.symbol || syms[i] || "",
        method: savedCfg.method || "RSI",
        params: savedCfg.params || {},
        maxOrder: savedCfg.maxOrder || "50",
        maxOpenOrders: savedCfg.maxOpenOrders || "5",
        maxExposure: savedCfg.maxExposure || "150",
        sl: savedCfg.sl || "-1.5",
        tp: savedCfg.tp || "3",
        smart_config: { ...defaultSmart, ...(savedCfg.smart_config || {}) }, // 👈 merge profundo
      };
    }

    setConfigs(initConfigs);
  } catch (err) {
    console.error("Error cargando configuraciones", err);
    // fallback mínimo
    const fallback: Record<number, TokenConfig> = {};
    for (let i = 0; i < 5; i++) {
      fallback[i] = {
        symbol: ["BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "XRPUSDT"][i],
        method: "RSI",
        params: {},
        maxOrder: "50",
        maxOpenOrders: "5",
        maxExposure: "150",
        sl: "-1.5",
        tp: "3",
        smart_config: { ...defaultSmart },
      };
    }
    setConfigs(fallback);
    setAllPairs(["BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "XRPUSDT"]);
  } finally {
    setLoading(false);
  }
};


    init();
  }, []);

  const updateConfig = (idx: number, field: keyof TokenConfig, value: any) => {
    setConfigs((prev) => ({
      ...prev,
      [idx]: { ...prev[idx], [field]: value },
    }));
  };

  const updateParams = (idx: number, field: string, value: string) => {
    setConfigs((prev) => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        params: { ...prev[idx].params, [field]: value },
      },
    }));
  };

const updateSmart = (idx: number, field: keyof SmartConfig, value: any) => {
  setConfigs((prev) => {
    const updated = {
      ...prev,
      [idx]: {
        ...prev[idx],
        smart_config: { ...(prev[idx].smart_config || {}), [field]: value },
      },
    };

    console.log("📝 updateSmart()", {
      idx,
      field,
      value,
      newConfig: updated[idx].smart_config,
    });

    return updated;
  });
};



const activateFormula = async (idx: number, strategy: string, formula: any) => {
  try {
    const cfg = configs[idx];
    if (!cfg || !cfg.symbol) {
      console.warn("⚠️ No hay configuración válida para activar fórmula");
      return;
    }

    // 🔹 Normalizamos la fórmula antes de mandarla
    const cleanFormula = {
      accuracy: formula?.accuracy ?? null,
      profit: formula?.profit ?? null,
      formula_human: formula?.formula_human ?? JSON.stringify(formula?.features || []),
    };

    const payload = {
      symbol: cfg.symbol,
      strategy_name: strategy,
      formula: cleanFormula,
    };

    console.log("📤 Activando fórmula:", payload);

    const res = await fetch("http://127.0.0.1:8080/smart/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), // 👈 garantizado JSON válido
    });

    const data = await res.json();
    if (data.success) {
      updateSmart(idx, "activeFormula", cleanFormula);
      updateSmart(idx, "activeStrategy", strategy);
      alert(`✅ Estrategia ${strategy} activada para ${cfg.symbol}`);
    } else {
      alert(`❌ Error activando: ${data.detail}`);
    }
  } catch (err) {
    console.error("❌ Error en activateFormula", err);
    alert("❌ Error activando estrategia");
  }
};



const retrainSmart = (cfg: TokenConfig, idx: number) => {
  if (!cfg.smart_config) return;

  try {
    updateSmart(idx, "trainingProgress", 0);

    // ✅ Reusar WS si ya existe para este símbolo
    if (wsCache[cfg.symbol]) {
      console.log(`♻️ Reusando WS existente para ${cfg.symbol}`);
      return;
    }

    const ws = new WebSocket("ws://127.0.0.1:8080/ws/smart/retrain");
    wsCache[cfg.symbol] = ws;

    ws.onopen = () => {
      console.log(`✅ WebSocket conectado para ${cfg.symbol}`);
      ws.send(
        JSON.stringify({
          ...cfg.smart_config,
          pair: cfg.symbol,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`📩 WS mensaje (${cfg.symbol}):`, data);

        // 🔄 Keepalive
        if (data.status === "ping") {
          const now = new Date().toISOString();
          updateSmart(idx, "lastPingAt", now);
          console.log(`📡 Ping recibido de ${cfg.symbol} a las ${now}`);
          return; // 👈 evitamos que caiga en el switch
        }

        switch (data.status) {
          case "info":
            // 👀 Mensajes informativos del backend
            console.log(`ℹ️ ${cfg.symbol}: ${data.message}`);
            updateSmart(idx, "lastInfo", data.message);
            break;

          case "progress":
            if (typeof data.progress === "number") {
              updateSmart(idx, "trainingProgress", data.progress);
            }
            if (data.message) {
              console.log(`📊 Progreso ${cfg.symbol}: ${data.message}`);
              updateSmart(idx, "lastInfo", data.message);
            }
            break;

          case "done":
            updateSmart(idx, "manifestPath", data.manifest);
            updateSmart(idx, "lastTrainedAt", new Date().toISOString());

            if (data.formulas) {
              updateSmart(idx, "formulas", {
                best_by_accuracy: data.formulas.best_by_accuracy || [],
                best_by_profit: data.formulas.best_by_profit || [],
                best_balanced: data.formulas.best_balanced || [],
              });
            }

            updateSmart(idx, "trainingProgress", 100);
            console.log(`✅ Entrenamiento finalizado para ${cfg.symbol}`);
            break;

          case "warning":
            console.warn(`⚠️ ${data.message}`);
            break;

          case "error":
            alert(`❌ Error: ${data.message}`);
            updateSmart(idx, "trainingProgress", undefined);
            ws.close();
            delete wsCache[cfg.symbol];
            break;

          default:
            console.log("❔ Mensaje no reconocido:", data);
        }
      } catch (err) {
        console.error("❌ Error parseando mensaje WS", err);
      }
    };

    ws.onclose = () => {
      console.log(`⚠️ WS cerrado para ${cfg.symbol}`);
      updateSmart(idx, "trainingProgress", undefined);
      delete wsCache[cfg.symbol];
    };

    ws.onerror = (err) => {
      console.error(`❌ WS error en ${cfg.symbol}:`, err);
      updateSmart(idx, "trainingProgress", undefined);
      ws.close();
      delete wsCache[cfg.symbol];
    };
  } catch (err) {
    console.error("❌ Error retraining smart", err);
    alert("❌ Error en entrenamiento SmartTrading");
    updateSmart(idx, "trainingProgress", undefined);
  }
};






const saveConfigs = async () => {
  try {
    for (const key of Object.keys(configs)) {
      const cfg = configs[parseInt(key)];
      if (!cfg.symbol) continue;

        const payload = {
          ...cfg,
          params: cfg.params || {},
          method: cfg.method, // 👈 aseguramos que method se guarde
          sl: cfg.sl ? parseFloat(cfg.sl) : 0,
          tp: cfg.tp ? parseFloat(cfg.tp) : 0,
          maxOrder: cfg.maxOrder ? parseFloat(cfg.maxOrder) : 0,
          maxOpenOrders: cfg.maxOpenOrders ? parseInt(cfg.maxOpenOrders) : 0,
          maxExposure: cfg.maxExposure ? parseFloat(cfg.maxExposure) : 0,
          smart_config: cfg.smart_config ? { ...cfg.smart_config } : undefined,
        };

      console.log("📤 saveConfigs() → payload enviado:", payload);

      await fetch("http://127.0.0.1:8080/config/trading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 🔥 Actualizamos el contexto global inmediatamente
      setConfigs((prev) => ({
        ...prev,
        [payload.symbol]: {
          ...payload,
        },
      }));

    }
    alert("✅ Configuraciones guardadas correctamente");
  } catch (err) {
    console.error("❌ Error saving configs", err);
    alert("❌ Error guardando configuraciones");
  }
};



  const retrainAi = (symbol: string) => {
    fetch(`http://127.0.0.1:8080/ai/retrain/${symbol}`, { method: "POST" })
      .then((res) => res.json())
      .then(() => alert(`AI retraining started for ${symbol}`))
      .catch((err) => console.error("Error retraining AI", err));
  };

  if (loading) {
    return <p style={{ textAlign: "center" }}>Cargando configuraciones...</p>;
  }

  return (
    <Wrap>
      <Grid>
        {Object.keys(configs).map((key) => {
          const idx = parseInt(key);
          const cfg = configs[idx];
          if (!cfg) return null;

          const usedSymbols = Object.values(configs)
            .filter((c, i) => i !== idx)
            .map((c) => c.symbol);
          const availableOptions = allPairs.filter(
            (s) => !usedSymbols.includes(s)
          );

          return (
            <PairCard key={idx}>
              <Title>Par {cfg.symbol || "-"}</Title>
              <PairSelectWrap>
                <StyledSelect
                  value={cfg.symbol}
                  onChange={(e) => updateConfig(idx, "symbol", e.target.value)}
                  options={availableOptions.map((s) => ({
                    value: s,
                    label: s,
                  }))}
                />
              </PairSelectWrap>

              {/* Trading Method */}
              <Section>
                <SectionTitle>Método de Trading</SectionTitle>
                {["RSI", "EMA", "MACD", "SMART"].map((m) => (
                  <Checkbox
                    key={m}
                    label={m}
                    checked={cfg.method === m}
                    onChange={() =>
                      updateConfig(idx, "method", m as TradingMethod)
                    }
                  />
                ))}
              </Section>

              {/* RSI */}
              <Section>
                <SectionTitle>RSI</SectionTitle>
                <Input
                  label="Periodo"
                  placeholder="14"
                  value={cfg.params.rsiPeriod || ""}
                  onChange={(e) =>
                    updateParams(idx, "rsiPeriod", e.target.value)
                  }
                  disabled={cfg.method !== "RSI"}
                />
                <Input
                  label="Sobrecompra %"
                  placeholder="70"
                  value={cfg.params.rsiOverbought || ""}
                  onChange={(e) =>
                    updateParams(idx, "rsiOverbought", e.target.value)
                  }
                  disabled={cfg.method !== "RSI"}
                />
                <Input
                  label="Sobreventa %"
                  placeholder="30"
                  value={cfg.params.rsiOversold || ""}
                  onChange={(e) =>
                    updateParams(idx, "rsiOversold", e.target.value)
                  }
                  disabled={cfg.method !== "RSI"}
                />
              </Section>

              {/* EMA */}
              <Section>
                <SectionTitle>EMA</SectionTitle>
                <Input
                  label="Corto"
                  placeholder="12"
                  value={cfg.params.emaShort || ""}
                  onChange={(e) =>
                    updateParams(idx, "emaShort", e.target.value)
                  }
                  disabled={cfg.method !== "EMA"}
                />
                <Input
                  label="Largo"
                  placeholder="26"
                  value={cfg.params.emaLong || ""}
                  onChange={(e) =>
                    updateParams(idx, "emaLong", e.target.value)
                  }
                  disabled={cfg.method !== "EMA"}
                />
              </Section>

              {/* MACD */}
              <Section>
                <SectionTitle>MACD</SectionTitle>
                <Input
                  label="Rápido"
                  placeholder="12"
                  value={cfg.params.macdFast || ""}
                  onChange={(e) =>
                    updateParams(idx, "macdFast", e.target.value)
                  }
                  disabled={cfg.method !== "MACD"}
                />
                <Input
                  label="Lento"
                  placeholder="26"
                  value={cfg.params.macdSlow || ""}
                  onChange={(e) =>
                    updateParams(idx, "macdSlow", e.target.value)
                  }
                  disabled={cfg.method !== "MACD"}
                />
                <Input
                  label="Señal"
                  placeholder="9"
                  value={cfg.params.macdSignal || ""}
                  onChange={(e) =>
                    updateParams(idx, "macdSignal", e.target.value)
                  }
                  disabled={cfg.method !== "MACD"}
                />
              </Section>

              {/* RIESGO */}
              <Section>
                <SectionTitle>Riesgo</SectionTitle>
                <Input
                  label="Max Order Size"
                  value={cfg.maxOrder || ""}
                  onChange={(e) =>
                    updateConfig(idx, "maxOrder", e.target.value)
                  }
                />
                <Input
                  label="Max Open Orders"
                  value={cfg.maxOpenOrders || ""}
                  onChange={(e) =>
                    updateConfig(idx, "maxOpenOrders", e.target.value)
                  }
                />
                <Input
                  label="Max Exposure"
                  value={cfg.maxExposure || ""}
                  onChange={(e) =>
                    updateConfig(idx, "maxExposure", e.target.value)
                  }
                />
                <Input
                  label="Stop Loss %"
                  value={cfg.sl || ""}
                  onChange={(e) => updateConfig(idx, "sl", e.target.value)}
                />
                <Input
                  label="Take Profit %"
                  value={cfg.tp || ""}
                  onChange={(e) => updateConfig(idx, "tp", e.target.value)}
                />
              </Section>

{/* SMART */}
{cfg.method === "SMART" && cfg.smart_config && (
  <Section>
    <SectionTitle>SmartTrading</SectionTitle>

    {/* 🔹 Inputs básicos de SmartTrading */}
    <Input
      label="CSV Path"
      value={cfg.smart_config.dataPath}
      onChange={(e) => updateSmart(idx, "dataPath", e.target.value)}
    />
    <Input
      label="Timeframe"
      value={cfg.smart_config.timeframe}
      onChange={(e) => updateSmart(idx, "timeframe", e.target.value)}
    />
    <Input
      label="Outdir"
      value={cfg.smart_config.outdir}
      onChange={(e) => updateSmart(idx, "outdir", e.target.value)}
    />
    <Input
      label="Min Accuracy"
      value={cfg.smart_config.minAccuracy}
      onChange={(e) => updateSmart(idx, "minAccuracy", e.target.value)}
    />
    <Input
      label="Min Profit"
      value={cfg.smart_config.minProfit}
      onChange={(e) => updateSmart(idx, "minProfit", e.target.value)}
    />
    <Input
      label="Profit Target"
      value={cfg.smart_config.profitTarget}
      onChange={(e) => updateSmart(idx, "profitTarget", e.target.value)}
    />
    <Input
      label="Stop Loss"
      value={cfg.smart_config.stopLoss}
      onChange={(e) => updateSmart(idx, "stopLoss", e.target.value)}
    />
    <Input
      label="Delta T"
      value={cfg.smart_config.deltaT}
      onChange={(e) => updateSmart(idx, "deltaT", e.target.value)}
    />
    <Input
      label="Trailing Distance"
      value={cfg.smart_config.trailingDistance}
      onChange={(e) => updateSmart(idx, "trailingDistance", e.target.value)}
    />
    <Input
      label="Max Combinations"
      value={cfg.smart_config.maxCombinations}
      onChange={(e) => updateSmart(idx, "maxCombinations", e.target.value)}
    />

    <Button
      $variant="primary"
      onClick={() => retrainSmart(cfg, idx)}
      style={{ marginTop: "8px" }}
    >
      Reentrenar Smart
    </Button>

    {/* 🔹 Barra de progreso */}
    {cfg.smart_config.trainingProgress !== undefined &&
      cfg.smart_config.trainingProgress < 100 && (
        <div style={{ marginTop: "8px" }}>
          <div
            style={{
              height: "10px",
              width: "100%",
              background: "#333",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${cfg.smart_config.trainingProgress}%`,
                background: "#4caf50",
                transition: "width 0.3s",
              }}
            />
          </div>
          <p style={{ fontSize: "0.8rem", marginTop: "4px" }}>
            Progreso: {cfg.smart_config.trainingProgress}%
          </p>
        </div>
      )}

    {/* 🔹 Fecha del último entrenamiento */}
    {cfg.smart_config.lastTrainedAt && (
      <p style={{ fontSize: "0.8rem", marginTop: "6px" }}>
        Último entrenamiento:{" "}
        {new Date(cfg.smart_config.lastTrainedAt).toLocaleString()}
      </p>
    )}

    {/* 🔹 Mostrar fórmulas */}
    {cfg.smart_config.formulas && (
      <div style={{ marginTop: "12px" }}>
        {["best_by_accuracy", "best_by_profit", "best_balanced"].map((fKey) => {
          const formula = cfg.smart_config?.formulas?.[fKey];
          if (!formula) return null;
          return (
            <div
              key={fKey}
              style={{
                border: "1px solid #555",
                borderRadius: "6px",
                padding: "8px",
                marginBottom: "8px",
              }}
            >
              <strong>{fKey.replace("best_by_", "Mejor por ")}</strong>
              <p>Accuracy: {formula.accuracy}</p>
              <p>Profit: {formula.profit}</p>
              <p>Reglas: {formula.formula_human}</p>
              <Button
                $variant="secondary"
                onClick={() => activateFormula(idx, fKey, formula)} // 👈 ahora enviamos objeto fórmula
              >
                Activar
              </Button>
            </div>
          );
        })}
      </div>
    )}
  </Section>
)}


            </PairCard>
          );
        })}
      </Grid>
      <div style={{ textAlign: "center", marginTop: "20px" }}>
        <Button $variant="success" onClick={saveConfigs}>
          💾 Guardar Configuraciones
        </Button>
      </div>
    </Wrap>
  );
};

export default ConfigTrading;

// ✅ Hook compartido para MainDashboard
export function useTradingConfigs() {
  const [configs, setConfigs] = useState<Record<string, TokenConfig>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8080/config/trading");
        const saved: TokenConfig[] = await res.json();

        const cfgs: Record<string, TokenConfig> = {};
        for (const cfg of saved) {
          if (cfg.symbol) {
            cfgs[cfg.symbol] = cfg; // 🔹 indexado por símbolo
          }
        }
        setConfigs(cfgs);

        // 🔥 Log para debug: confirma que se cargaron correctamente
        console.log("📥 Configs iniciales desde backend:", cfgs);
      } catch (err) {
        console.error("Error fetching configs:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return { configs, loading, setConfigs }; // 👈 devolvemos también el setter
}

export function useTradingSymbols() {
  const [symbols, setSymbols] = useState<string[]>([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8080/symbols")
      .then((res) => res.json())
      .then((data) => setSymbols(data.symbols))
      .catch((err) => console.error("Error fetching symbols:", err));
  }, []);

  return symbols;
}
