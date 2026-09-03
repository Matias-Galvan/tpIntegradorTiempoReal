import { useState, useEffect, useCallback, useRef } from 'react';
import { gamaSocket, ConnectionState } from '../services/gamaSocket';

export { ConnectionState };

/**
 * Hook personalizado para interactuar con la simulación en GAMA Platform en tiempo real.
 *
 * Encapsula:
 * - Ciclo de vida de conexión con el WebSocket de GAMA Server.
 * - Estado de conectividad (`isConnected`, `connectionState`).
 * - Estado reactivo de la telemetría (`simulationData`).
 * - Métodos de control no bloqueantes: `play()`, `pause()`, `setHour()`, `step()`.
 * - Limpieza estricta de suscriptores para compatibilidad con React 18 Strict Mode.
 */
export function useGamaSimulation() {
  const [isConnected, setIsConnected] = useState(() => gamaSocket.isConnected());
  const [connectionState, setConnectionState] = useState(() => gamaSocket.getConnectionState());

  const [simulationData, setSimulationData] = useState({
    currentHour: 8,
    trafficFlow: 0,
    activeVehicles: 0,
    congestionLevel: 'FLUID', // 'FLUID' | 'MODERATE' | 'CONGESTED' | 'CRITICAL'
    roadDensities: [],
    cycle: 0,
    lastUpdated: null,
  });

  // Referencia para evitar re-suscripciones innecesarias
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    // Manejador del patrón Observer
    const handleSocketUpdate = (payload) => {
      if (!isMountedRef.current) return;

      if (payload.type === 'CONNECTION_STATUS') {
        setIsConnected(payload.isConnected);
        setConnectionState(payload.state);
        return;
      }

      // Actualización de telemetría entrante de GAMA
      setSimulationData((prev) => ({
        ...prev,
        currentHour: payload.currentHour !== undefined ? payload.currentHour : prev.currentHour,
        trafficFlow: payload.trafficFlow !== undefined ? payload.trafficFlow : prev.trafficFlow,
        activeVehicles: payload.activeVehicles !== undefined ? payload.activeVehicles : prev.activeVehicles,
        congestionLevel: payload.congestionLevel || prev.congestionLevel,
        roadDensities: Array.isArray(payload.roadDensities) ? payload.roadDensities : prev.roadDensities,
        cycle: payload.cycle !== undefined ? payload.cycle : prev.cycle,
        lastUpdated: payload.timestamp || Date.now(),
      }));
    };

    // Suscripción al singleton
    const unsubscribe = gamaSocket.subscribe(handleSocketUpdate);

    // Clean-up en unmount (vital en React 18 para evitar fugas de memoria o estados zombies)
    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, []);

  /**
   * Envía el comando de inicio o reanudación de simulación a GAMA
   */
  const play = useCallback(() => {
    return gamaSocket.play();
  }, []);

  /**
   * Envía el comando de pausa de simulación a GAMA
   */
  const pause = useCallback(() => {
    return gamaSocket.pause();
  }, []);

  /**
   * Ejecuta un único paso / ciclo en la simulación
   */
  const step = useCallback(() => {
    return gamaSocket.step();
  }, []);

  /**
   * Configura la hora del día en el modelo de tráfico de GAMA (0 - 23hs).
   * Envía la mutación compatible con GAMA Server set_parameter y expression.
   * @param {number} hour - Valor numérico entero de 0 a 23.
   */
  const setHour = useCallback((hour) => {
    const validHour = Math.min(23, Math.max(0, Number(hour)));

    // Actualizamos el estado optimista localmente para feedback inmediato
    setSimulationData((prev) => ({
      ...prev,
      currentHour: validHour,
    }));

    return gamaSocket.setSimulationHour(validHour);
  }, []);

  /**
   * Solicita a GAMA Server cargar o recargar el modelo RoadTrafficSDTR
   */
  const loadModel = useCallback(() => {
    return gamaSocket.loadModel();
  }, []);

  /**
   * Permite enviar cualquier comando libre hacia GAMA Server
   */
  const sendCommand = useCallback((cmdObj) => {
    return gamaSocket.sendCommand(cmdObj);
  }, []);

  return {
    isConnected,
    connectionState,
    simulationData,
    play,
    pause,
    step,
    setHour,
    loadModel,
    sendCommand,
  };
}

export default useGamaSimulation;
