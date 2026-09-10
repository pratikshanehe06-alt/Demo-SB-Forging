import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

const PlantContext = createContext(null);

export function PlantProvider({ children }) {
  const { token } = useAuth();
  const [plants, setPlants] = useState([]);
  const [selectedPlantId, setSelectedPlantId] = useState(() => localStorage.getItem("coreot_plant") || "all");

  useEffect(() => {
    if (!token) { setPlants([]); return; }
    api.get("/plants").then((r) => setPlants(r.data)).catch(() => {});
  }, [token]);

  function selectPlant(id) {
    setSelectedPlantId(id);
    if (id && id !== "all") localStorage.setItem("coreot_plant", id);
    else localStorage.removeItem("coreot_plant");
  }

  const params = selectedPlantId && selectedPlantId !== "all" ? { plant_id: selectedPlantId } : {};

  return (
    <PlantContext.Provider value={{ plants, selectedPlantId, selectPlant, params }}>
      {children}
    </PlantContext.Provider>
  );
}

export const usePlant = () => useContext(PlantContext);
