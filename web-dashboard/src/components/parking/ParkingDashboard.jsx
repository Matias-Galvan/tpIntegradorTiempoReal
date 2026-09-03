import React, { useState, useEffect, useCallback, useRef } from 'react';
import { gamaSocket } from '../../services/gamaSocket';
import ParkingSignage from './ParkingSignage';
import ParkingFloorMap from './ParkingFloorMap';
import InternalTrafficMonitor from './InternalTrafficMonitor';
import AccessLedger from './AccessLedger';
import ParkingControls from './ParkingControls';
import {
  generateInitialParkingSpots,
  computeFloorSummaries,
  generateInitialAccessLedger,
} from '../../utils/parkingDataHelper';

/**
 * ParkingDashboard
 * Vista integral del Centro de Operaciones del Estacionamiento Inteligente (4 Plantas, 400 Plazas).
 */
export const ParkingDashboard = React.memo(function ParkingDashboard() {
  const [isConnected, setIsConnected] = useState(gamaSocket.isConnected());
  const [activeFloor, setActiveFloor] = useState('A');
  const [isPlaying, setIsPlaying] = useState(false);

  // Estado inicial consistente y totalmente sincronizado desde el milisegundo cero
  const [telemetry, setTelemetry] = useState(() => {
    const initialSpots = generateInitialParkingSpots();
    const initialFloors = computeFloorSummaries(initialSpots);
    const initialOccupied = initialSpots.filter((s) => s.occ).length;

    return {
      cycle: 0,
      totalSpots: 400,
      totalOccupied: initialOccupied,
      totalAvailable: 400 - initialOccupied,
      inTransit: 3,
      arrivalRate: 0.5,
      isJamActive: false,
      jammedCorridor: '',
      floors: initialFloors,
      corridors: [
        { id: 'RAMP_A_B', name: 'Rampa Planta A -> B', is_ramp: true, capacity: 8, vehicles: 2, density: 25, is_jammed: false },
        { id: 'RAMP_B_C', name: 'Rampa Planta B -> C', is_ramp: true, capacity: 8, vehicles: 1, density: 12, is_jammed: false },
        { id: 'RAMP_C_D', name: 'Rampa Planta C -> D', is_ramp: true, capacity: 8, vehicles: 0, density: 0, is_jammed: false },
        { id: 'AISLE_A', name: 'Pasillo Principal Planta A', is_ramp: false, capacity: 14, vehicles: 3, density: 21, is_jammed: false },
        { id: 'AISLE_B', name: 'Pasillo Principal Planta B', is_ramp: false, capacity: 14, vehicles: 2, density: 14, is_jammed: false },
        { id: 'AISLE_C', name: 'Pasillo Principal Planta C', is_ramp: false, capacity: 14, vehicles: 1, density: 7, is_jammed: false },
        { id: 'AISLE_D', name: 'Pasillo Principal Planta D', is_ramp: false, capacity: 14, vehicles: 1, density: 7, is_jammed: false },
      ],
      spots: initialSpots,
      accessLedger: generateInitialAccessLedger(),
      lastUpdated: Date.now(),
    };
  });

  const simTimerRef = useRef(null);

  // Función atómica de avance de ciclo de simulación
  const advanceSimulationStep = useCallback(() => {
    setTelemetry((prev) => {
      let updatedSpots = [...prev.spots];
      let newLedger = [...prev.accessLedger];
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      // 1. Simular posibles egresos (vehículos cuya estadía finaliza)
      const occupiedSpots = updatedSpots.filter((s) => s.occ);
      if (occupiedSpots.length > 50 && Math.random() < 0.35) {
        const leavingSpot = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
        updatedSpots = updatedSpots.map((s) => {
          if (s.id === leavingSpot.id) {
            return { ...s, occ: false, car: '', t_in: '', duration: 0 };
          }
          return s;
        });

        newLedger.unshift({
          type: 'EXIT',
          vehicleId: leavingSpot.car || 'ARG-000',
          spotId: leavingSpot.id,
          floor: leavingSpot.floor,
          time: timeStr,
          durationSec: Math.floor(180 + Math.random() * 400),
          cycle: prev.cycle + 1,
        });
      }

      // 2. Simular arribos de vehículos según la tasa configurada
      if (Math.random() < prev.arrivalRate) {
        const freeSpots = updatedSpots.filter((s) => !s.occ);
        if (freeSpots.length > 0) {
          const target = freeSpots[Math.floor(Math.random() * freeSpots.length)];
          const newPlate = `ARG-${Math.floor(100 + Math.random() * 900)}-${target.floor}`;

          updatedSpots = updatedSpots.map((s) => {
            if (s.id === target.id) {
              return {
                ...s,
                occ: true,
                car: newPlate,
                t_in: timeStr,
                duration: Math.floor(60 + Math.random() * 200),
              };
            }
            return s;
          });

          newLedger.unshift({
            type: 'ENTRY',
            vehicleId: newPlate,
            spotId: target.id,
            floor: target.floor,
            time: timeStr,
            cycle: prev.cycle + 1,
          });
        }
      }

      const updatedFloors = computeFloorSummaries(updatedSpots);
      const totalOcc = updatedSpots.filter((s) => s.occ).length;

      // Dinámica de vehículos circulando en pasillos y rampas
      const updatedCorridors = prev.corridors.map((c) => {
        if (c.is_jammed || prev.isJamActive) {
          return { ...c, density: Math.min(100, Math.floor(75 + Math.random() * 20)), vehicles: Math.min(c.capacity, Math.floor(c.capacity * 0.9)) };
        }
        const v = Math.max(0, Math.min(c.capacity, Math.floor(Math.random() * 4)));
        const d = Math.round((v / c.capacity) * 100);
        return { ...c, vehicles: v, density: d };
      });

      return {
        ...prev,
        cycle: prev.cycle + 1,
        totalOccupied: totalOcc,
        totalAvailable: 400 - totalOcc,
        inTransit: Math.floor(2 + Math.random() * 6),
        spots: updatedSpots,
        floors: updatedFloors,
        corridors: updatedCorridors,
        accessLedger: newLedger.slice(0, 20),
        lastUpdated: Date.now(),
      };
    });
  }, []);

  // Suscripción al WebSocket de GAMA Server
  useEffect(() => {
    const handleSocketUpdate = (data) => {
      if (!data) return;

      if (data.type === 'CONNECTION_STATUS') {
        setIsConnected(data.isConnected);
        return;
      }

      if (data.type === 'PARKING_TELEMETRY_UPDATE') {
        setTelemetry((prev) => ({
          cycle: data.cycle ?? prev.cycle + 1,
          totalSpots: data.totalSpots ?? 400,
          totalOccupied: data.totalOccupied ?? prev.totalOccupied,
          totalAvailable: data.totalAvailable ?? prev.totalAvailable,
          inTransit: data.inTransit ?? prev.inTransit,
          arrivalRate: data.arrivalRate ?? prev.arrivalRate,
          isJamActive: data.isJamActive ?? prev.isJamActive,
          jammedCorridor: data.jammedCorridor ?? prev.jammedCorridor,
          floors: data.floors?.length > 0 ? data.floors : prev.floors,
          corridors: data.corridors?.length > 0 ? data.corridors : prev.corridors,
          spots: data.spots?.length > 0 ? data.spots : prev.spots,
          accessLedger: data.accessLedger?.length > 0 ? data.accessLedger : prev.accessLedger,
          lastUpdated: data.timestamp ?? Date.now(),
        }));
      }
    };

    gamaSocket.setActiveModule('PARKING');
    const unsubscribe = gamaSocket.subscribe(handleSocketUpdate);

    return () => {
      unsubscribe();
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, []);

  // Controles de Simulación Play / Pause / Step
  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    gamaSocket.play();

    if (simTimerRef.current) clearInterval(simTimerRef.current);
    simTimerRef.current = setInterval(advanceSimulationStep, 1000);
  }, [advanceSimulationStep]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    gamaSocket.pause();

    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
  }, []);

  const handleStep = useCallback(() => {
    gamaSocket.step();
    advanceSimulationStep();
  }, [advanceSimulationStep]);

  const handleRateChange = useCallback((rate) => {
    gamaSocket.setParkingArrivalRate(rate);
    setTelemetry((prev) => ({ ...prev, arrivalRate: rate }));
  }, []);

  // Ingreso Manual de Auto (Zero-Latency con actualización visual inmediata)
  const handleSpawnManual = useCallback(() => {
    // 1. Notificar a GAMA Server
    gamaSocket.spawnManualVehicle();

    // 2. Inyección local inmediata en el estado del tablero
    setTelemetry((prev) => {
      const availableInFloor = prev.spots.filter((s) => !s.occ && s.floor === activeFloor);
      const targetSpot = availableInFloor.length > 0 ? availableInFloor[0] : prev.spots.find((s) => !s.occ);

      if (!targetSpot) {
        return prev;
      }

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const newPlate = `ARG-${Math.floor(100 + Math.random() * 900)}-M`;

      const updatedSpots = prev.spots.map((s) => {
        if (s.id === targetSpot.id) {
          return {
            ...s,
            occ: true,
            car: newPlate,
            t_in: timeStr,
            duration: Math.floor(80 + Math.random() * 120),
          };
        }
        return s;
      });

      const updatedFloors = computeFloorSummaries(updatedSpots);
      const totalOcc = updatedSpots.filter((s) => s.occ).length;

      const newLedgerEntry = {
        type: 'ENTRY',
        vehicleId: newPlate,
        spotId: targetSpot.id,
        floor: targetSpot.floor,
        time: timeStr,
        cycle: prev.cycle + 1,
      };

      return {
        ...prev,
        cycle: prev.cycle + 1,
        totalOccupied: totalOcc,
        totalAvailable: 400 - totalOcc,
        inTransit: Math.min(12, prev.inTransit + 1),
        spots: updatedSpots,
        floors: updatedFloors,
        accessLedger: [newLedgerEntry, ...prev.accessLedger.slice(0, 19)],
        lastUpdated: Date.now(),
      };
    });
  }, [activeFloor]);

  // Simulación y despeje de atascamiento en rampas
  const handleTriggerJam = useCallback((corridor = 'RAMP_A_B') => {
    gamaSocket.triggerParkingJam(corridor);
    setTelemetry((prev) => ({
      ...prev,
      isJamActive: true,
      jammedCorridor: corridor,
      corridors: prev.corridors.map((c) =>
        c.id === corridor ? { ...c, is_jammed: true, density: 95, vehicles: c.capacity } : c
      ),
    }));
  }, []);

  const handleClearJam = useCallback(() => {
    gamaSocket.clearParkingJam();
    setTelemetry((prev) => ({
      ...prev,
      isJamActive: false,
      jammedCorridor: '',
      corridors: prev.corridors.map((c) =>
        c.id === prev.jammedCorridor ? { ...c, is_jammed: false, density: 15, vehicles: 1 } : c
      ),
    }));
  }, []);

  return (
    <div className="parking-dashboard-root">
      {/* Banner de Estado de Conexión */}
      <div className={`connection-banner ${isConnected ? 'status-ok' : 'status-alert'}`}>
        <div className="banner-info">
          <span className="pulsing-dot" />
          <span className="banner-text">
            <strong>GAMA Parking Engine:</strong>{' '}
            {isConnected
              ? 'Conexión activa (ws://localhost:6868) - Sensores y aforo sincronizados'
              : 'Desconectado de GAMA Server. Ejecute "npm run gama-server" o utilice la simulación local.'}
          </span>
        </div>
        <div className="banner-meta">
          <span>Ciclo: <strong>#{telemetry.cycle}</strong></span>
          <span className="separator">•</span>
          <span>Plazas Totales: <strong>{telemetry.totalSpots}</strong></span>
          <span className="separator">•</span>
          <span>Ocupadas: <strong style={{ color: '#ef4444' }}>{telemetry.totalOccupied}</strong></span>
          <span className="separator">•</span>
          <span>Libres: <strong style={{ color: '#10b981' }}>{telemetry.totalAvailable}</strong></span>
        </div>
      </div>

      {/* Controles de Simulación */}
      <ParkingControls
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onPause={handlePause}
        onStep={handleStep}
        arrivalRate={telemetry.arrivalRate}
        onRateChange={handleRateChange}
        onSpawnManual={handleSpawnManual}
        disabled={false}
      />

      {/* 1. Cartelería Digital de Aforo (General y por Planta con Flechas Roja/Verde) */}
      <ParkingSignage
        totalOccupied={telemetry.totalOccupied}
        totalAvailable={telemetry.totalAvailable}
        totalSpots={telemetry.totalSpots}
        floors={telemetry.floors}
      />

      {/* 2. Tráfico Interno y Detección de Atascamientos */}
      <InternalTrafficMonitor
        corridors={telemetry.corridors}
        inTransit={telemetry.inTransit}
        isJamActive={telemetry.isJamActive}
        onTriggerJam={handleTriggerJam}
        onClearJam={handleClearJam}
      />

      {/* 3. Plano Arquitectónico 2D y Grilla de 100 Plazas */}
      <ParkingFloorMap
        spots={telemetry.spots}
        activeFloor={activeFloor}
        onFloorChange={setActiveFloor}
        isJamActive={telemetry.isJamActive}
        inTransit={telemetry.inTransit}
      />

      {/* 4. Bitácora Temporal y Control de Accesos (T_in / T_out) */}
      <AccessLedger
        ledger={telemetry.accessLedger}
      />
    </div>
  );
});

export default ParkingDashboard;
