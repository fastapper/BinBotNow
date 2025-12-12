import React, { createContext, useContext, useEffect, useState } from "react";

type TradingConfig = {
  method: string;
  // puedes agregar más configuraciones aquí
};

type TradingConfigs = {
  [symbol: string]: TradingConfig;
};

type TradingConfigContextType = {
  configs: TradingConfigs;
  updateConfig: (symbol: string, config: TradingConfig) => void;
};

const TradingConfigContext = createContext<TradingConfigContextType | undefined>(undefined);

export const TradingConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [configs, setConfigs] = useState<TradingConfigs>({});

  // Cargar configs al inicio desde el backend
  useEffect(() => {
    fetch("http://127.0.0.1:8080/config/trading")
      .then((res) => res.json())
      .then((data) => {
        const cfgs: TradingConfigs = {};
        for (const cfg of data) {
          if (cfg.symbol) {
            cfgs[cfg.symbol] = { method: cfg.method };
          }
        }
        setConfigs(cfgs);
      })
      .catch((err) => console.error("Error cargando configs:", err));
  }, []);

  const updateConfig = (symbol: string, config: TradingConfig) => {
    setConfigs((prev) => ({ ...prev, [symbol]: config }));

    // Persistir en backend
    fetch("http://127.0.0.1:8080/config/trading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, ...config }),
    }).catch((err) => console.error("Error guardando config:", err));
  };

  return (
    <TradingConfigContext.Provider value={{ configs, updateConfig }}>
      {children}
    </TradingConfigContext.Provider>
  );
};

// Hook para acceder fácil al contexto
export const useTradingConfigs = () => {
  const context = useContext(TradingConfigContext);
  if (!context) {
    throw new Error("useTradingConfigs debe usarse dentro de un TradingConfigProvider");
  }
  return context;
};
