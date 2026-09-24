import { createContext, useContext, useState, useCallback } from "react";

const KioskContext = createContext(null);

export function KioskProvider({ children }) {
  const [isKiosk, setIsKiosk] = useState(false);

  const enterKiosk = useCallback(() => setIsKiosk(true), []);
  const exitKiosk = useCallback(() => setIsKiosk(false), []);
  const toggleKiosk = useCallback(() => setIsKiosk((v) => !v), []);

  return (
    <KioskContext.Provider value={{ isKiosk, enterKiosk, exitKiosk, toggleKiosk }}>
      {children}
    </KioskContext.Provider>
  );
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used within a KioskProvider");
  return ctx;
}
