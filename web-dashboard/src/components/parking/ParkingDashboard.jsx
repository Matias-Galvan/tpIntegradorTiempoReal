import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { gamaSocket } from '../../services/gamaSocket';
import ParkingSignage from './ParkingSignage';
import ParkingFloorMap from './ParkingFloorMap';
import InternalTrafficMonitor from './InternalTrafficMonitor';
import RampMutexIndicator from './RampMutexIndicator';
import EmergencyEvacuationPanel from './EmergencyEvacuationPanel';
import VehicleFinderBar from './VehicleFinderBar';
import ParkingBillingModal from './ParkingBillingModal';
import AccessLedger from './AccessLedger';
import ParkingControls from './ParkingControls';
import ParkingNotificationCenter from './ParkingNotificationCenter';
import { notificationService } from '../../services/notificationService';
import {
  generateInitialParkingSpots,
  computeFloorSummaries,
  generateInitialAccessLedger,
  findOptimalSpotSmartDispatch,
  getInitialRampMutexes,
  stepRampMutexes,
  computeEvacuationMetrics,
  calculateParkingFee,
} from '../../utils/parkingDataHelper';

/**
 * Calcula los segmentos de pasillos y rampas necesarios para alcanzar una planta
 */
function getRouteForFloor(floor, isExit = false) {
  let segments = ['AISLE_A'];
  if (floor === 'B') segments = ['AISLE_A', 'RAMP_A_B', 'AISLE_B'];
  else if (floor === 'C') segments = ['AISLE_A', 'RAMP_A_B', 'AISLE_B', 'RAMP_B_C', 'AISLE_C'];
  else if (floor === 'D') segments = ['AISLE_A', 'RAMP_A_B', 'AISLE_B', 'RAMP_B_C', 'AISLE_C', 'RAMP_C_D', 'AISLE_D'];
  return isExit ? [...segments].reverse() : segments;
}

/**
 * ParkingDashboard
 * Vista integral del Centro de Operaciones del Estacionamiento Inteligente (4 Plantas, 400 Plazas).
 * Incorpora la Dimensión SDTR y Algoritmos de Concurrencia:
 * - Control de Concurrencia con Semáforos Mutex en Rampas (Deadlock Prevention).
 * - Algoritmo de Despacho Predictivo Inteligente (Función de Costo J y Balanceo de Carga).
 * - Protocolo de Evacuación Crítica de Emergencia con Cronómetro y Medición de WCET.
 * - Centro de Notificaciones y Auditoría en Tiempo Real con pasarela Push (WhatsApp API).
 */
export const ParkingDashboard = React.memo(function ParkingDashboard() {
  const [isConnected, setIsConnected] = useState(gamaSocket.isConnected());
  const [activeFloor, setActiveFloor] = useState('A');
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeView, setActiveView] = useState('OPERATION'); // 'OPERATION' | 'NOTIFICATIONS'
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);

  // Estados SDTR y Concurrencia
  const [smartDispatchEnabled, setSmartDispatchEnabled] = useState(true);
  const [lastDispatch, setLastDispatch] = useState({
    vehicleId: 'AF 502 KL',
    spotId: 'B-5',
    route: 'Rampa A->B -> Puesto B-5',
    eta: 11,
  });
  const [rampMutexes, setRampMutexes] = useState(() => getInitialRampMutexes());
  const [isEmergency, setIsEmergency] = useState(false);
  const [emergencyElapsed, setEmergencyElapsed] = useState(0);

  // Estados de Búsqueda y Facturación en Tiempo Real
  const [accumulatedRevenue, setAccumulatedRevenue] = useState(64800);
  const [searchedSpotId, setSearchedSpotId] = useState(null);
  const [billingSpot, setBillingSpot] = useState(null);

  // Suscripción al contador de alertas críticas para badge en el tab
  useEffect(() => {
    const unsub = notificationService.subscribe((items) => {
      const critCount = items.filter((it) => it.severity === 'CRITICAL').length;
      setUnreadAlertCount(critCount);
    });
    return () => unsub();
  }, []);

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
      inTransit: 0,
      arrivalRate: 4,
      isJamActive: false,
      jammedCorridor: '',
      floors: initialFloors,
      corridors: [
        { id: 'RAMP_A_B', name: 'Rampa Planta A -> B', is_ramp: true, capacity: 8, vehicles: 0, density: 0, is_jammed: false },
        { id: 'RAMP_B_C', name: 'Rampa Planta B -> C', is_ramp: true, capacity: 8, vehicles: 0, density: 0, is_jammed: false },
        { id: 'RAMP_C_D', name: 'Rampa Planta C -> D', is_ramp: true, capacity: 8, vehicles: 0, density: 0, is_jammed: false },
        { id: 'AISLE_A', name: 'Pasillo Principal Planta A', is_ramp: false, capacity: 14, vehicles: 0, density: 0, is_jammed: false },
        { id: 'AISLE_B', name: 'Pasillo Principal Planta B', is_ramp: false, capacity: 14, vehicles: 0, density: 0, is_jammed: false },
        { id: 'AISLE_C', name: 'Pasillo Principal Planta C', is_ramp: false, capacity: 14, vehicles: 0, density: 0, is_jammed: false },
        { id: 'AISLE_D', name: 'Pasillo Principal Planta D', is_ramp: false, capacity: 14, vehicles: 0, density: 0, is_jammed: false },
      ],
      spots: initialSpots,
      accessLedger: generateInitialAccessLedger(),
      lastUpdated: Date.now(),
    };
  });

  const simTimerRef = useRef(null);
  const navigatingRef = useRef([]);
  const rampMutexesRef = useRef(getInitialRampMutexes());

  // Métricas analíticas de evacuación WCET
  const evacuationMetrics = useMemo(() => {
    return computeEvacuationMetrics(telemetry.totalOccupied, emergencyElapsed, isEmergency);
  }, [telemetry.totalOccupied, emergencyElapsed, isEmergency]);

  // Función atómica de avance de ciclo de simulación
  const advanceSimulationStep = useCallback(() => {
    // 1. Si hay evacuación de emergencia, incrementar cronómetro
    if (isEmergency) {
      setEmergencyElapsed((prev) => prev + 1);
    }

    // 2. Avanzar la máquina de estados de los Semáforos Mutex en rampas de forma síncrona y determinista
    const currentMutexes = stepRampMutexes(rampMutexesRef.current, navigatingRef.current, isEmergency);
    rampMutexesRef.current = currentMutexes;
    setRampMutexes(currentMutexes);

    // 3. Avanzar los agentes de navegación por sus tramos (2 segundos por segmento; 1s en evacuación)
    const segmentDuration = isEmergency ? 1 : 2;
    const remainingAgents = [];

    for (const agent of navigatingRef.current) {
      agent.totalTicks = (agent.totalTicks || 0) + 1;
      const curSeg = agent.route[agent.stepIndex];
      const isRamp = curSeg ? curSeg.startsWith('RAMP_') : false;

      if (!curSeg) {
        continue;
      }

      if (isRamp) {
        const mutex = currentMutexes.find((m) => m.id === curSeg);
        const rampState = mutex ? mutex.state : (isEmergency ? 'DOWN' : 'UP');

        if (isEmergency) {
          agent.isWaiting = false;
          agent.waitingAtRamp = null;
          agent.currentSegment = curSeg;
          agent.ticksInSegment += 1;
        } else if (agent.direction === 'UP' && rampState === 'UP') {
          agent.isWaiting = false;
          agent.waitingAtRamp = null;
          agent.currentSegment = curSeg;
          agent.ticksInSegment += 1;
        } else if (agent.direction === 'DOWN' && rampState === 'DOWN') {
          agent.isWaiting = false;
          agent.waitingAtRamp = null;
          agent.currentSegment = curSeg;
          agent.ticksInSegment += 1;
        } else {
          // Anti-starvation: si ha esperado más de 6 ticks en cola y la rampa no tiene tráfico en contra, permitir paso
          agent.waitingTicks = (agent.waitingTicks || 0) + 1;
          if (agent.waitingTicks > 6 && (!mutex || mutex.activeVehicles === 0)) {
            agent.isWaiting = false;
            agent.waitingAtRamp = null;
            agent.currentSegment = curSeg;
            agent.ticksInSegment += 1;
          } else {
            agent.isWaiting = true;
            agent.waitingAtRamp = curSeg;
            agent.currentSegment = curSeg;
          }
        }
      } else {
        // Pasillo común: avance normal
        agent.isWaiting = false;
        agent.waitingAtRamp = null;
        agent.currentSegment = curSeg;
        agent.ticksInSegment += 1;
      }

      if (!agent.isWaiting && agent.ticksInSegment >= segmentDuration) {
        agent.stepIndex += 1;
        agent.ticksInSegment = 0;
        agent.waitingTicks = 0;
        if (agent.stepIndex < agent.route.length) {
          agent.currentSegment = agent.route[agent.stepIndex];
        }
      }

      // Mantener en tránsito si aún tiene tramos y no excedió el watchdog de 35 segundos
      if (agent.stepIndex < agent.route.length && agent.totalTicks < 35) {
        remainingAgents.push(agent);
      }
    }
    navigatingRef.current = remainingAgents;

    // 4. Actualizar estado del estacionamiento (arribos, egresos, pasillos)
    setTelemetry((prev) => {
      let updatedSpots = [...prev.spots];
      let newLedger = [...prev.accessLedger];
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

      // A. MODO EVACUACIÓN DE EMERGENCIA: Descarga masiva rápida hacia las salidas
      if (isEmergency) {
        const occupiedSpots = updatedSpots.filter((s) => s.occ);
        const evacuateBatchSize = Math.min(occupiedSpots.length, 2);

        for (let i = 0; i < evacuateBatchSize; i++) {
          const leaving = occupiedSpots[i];
          if (leaving) {
            updatedSpots = updatedSpots.map((s) => {
              if (s.id === leaving.id) {
                return { ...s, occ: false, car: '', t_in: '', duration: 0 };
              }
              return s;
            });

            newLedger.unshift({
              type: 'EXIT',
              vehicleId: leaving.car || 'ARG-EVAC',
              spotId: leaving.id,
              floor: leaving.floor,
              time: timeStr,
              durationSec: Math.floor(40 + Math.random() * 80),
              cycle: prev.cycle + 1,
            });

            // Registrar agente de evacuación en descenso hacia la salida
            const evacRoute = getRouteForFloor(leaving.floor, true);
            navigatingRef.current.push({
              id: `NAV-EVAC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              type: 'EVAC',
              vehicleId: leaving.car || 'ARG-EVAC',
              vehicleType: leaving.vehicleType || 'AUTO',
              targetSpotId: leaving.id,
              targetFloor: leaving.floor,
              route: evacRoute,
              stepIndex: 0,
              ticksInSegment: 0,
              currentSegment: evacRoute[0],
              direction: 'DOWN',
              waitingAtRamp: null,
              isWaiting: false,
            });
          }
        }
      } else {
        // B. OPERACIÓN NORMAL:
        // Simular egresos ordinarios (vehículos cuya estadía finaliza, proporcionales al flujo de arribos)
        const occupiedSpots = updatedSpots.filter((s) => s.occ);
        const exitProb = Math.max(0.005, ((prev.arrivalRate || 4) / 60) * 0.85);
        if (occupiedSpots.length > 25 && Math.random() < exitProb) {
          const leavingSpot = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
          const exitDurMin = leavingSpot.duration > 0 ? leavingSpot.duration : Math.floor(60 + Math.random() * 180);
          const feeData = calculateParkingFee(exitDurMin, leavingSpot.vehicleType, leavingSpot.spotType);

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
            durationSec: exitDurMin * 60,
            fee: feeData.totalAmount,
            cycle: prev.cycle + 1,
          });

          setAccumulatedRevenue((prevRev) => prevRev + feeData.totalAmount);

          notificationService.notifyVehicleExit(
            leavingSpot.car || 'ARG-000',
            leavingSpot.id,
            leavingSpot.floor,
            feeData.totalAmount,
            exitDurMin * 60
          );

          // Crear agente real de navegación hacia la salida (sentido DOWN)
          const exitRoute = getRouteForFloor(leavingSpot.floor, true);
          navigatingRef.current.push({
            id: `NAV-OUT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            type: 'EXIT',
            vehicleId: leavingSpot.car || 'ARG-000',
            vehicleType: leavingSpot.vehicleType || 'AUTO',
            targetSpotId: leavingSpot.id,
            targetFloor: leavingSpot.floor,
            route: exitRoute,
            stepIndex: 0,
            ticksInSegment: 0,
            currentSegment: exitRoute[0],
            direction: 'DOWN',
            waitingAtRamp: null,
            isWaiting: false,
          });
        }

        // Simular arribos de vehículos según la tasa configurada en autos/minuto (prob/seg = arrivalRate / 60)
        const arrivalProb = Math.max(0.005, (prev.arrivalRate || 4) / 60);
        if (Math.random() < arrivalProb) {
          let target = null;
          let routeInfo = null;

          if (smartDispatchEnabled) {
            // Algoritmo SDTR: Despacho Predictivo Óptimo
            routeInfo = findOptimalSpotSmartDispatch(updatedSpots, prev.corridors);
            if (routeInfo) target = routeInfo.spot;
          } else {
            // Asignación simple aleatoria
            const freeSpots = updatedSpots.filter((s) => !s.occ);
            if (freeSpots.length > 0) {
              target = freeSpots[Math.floor(Math.random() * freeSpots.length)];
            }
          }

          if (target) {
            const newPlate = `ARG-${Math.floor(100 + Math.random() * 900)}-${target.floor}`;
            const vType = Math.random() < 0.3 ? '4X4' : 'AUTO';
            const randomStayHrs = [1, 2, 2, 3, 4, 6, 8, 12, 14, 24][Math.floor(Math.random() * 10)];

            updatedSpots = updatedSpots.map((s) => {
              if (s.id === target.id) {
                return {
                  ...s,
                  occ: true,
                  car: newPlate,
                  vehicleType: vType,
                  stayHours: randomStayHrs,
                  t_in: timeStr,
                  duration: randomStayHrs * 60,
                };
              }
              return s;
            });

            if (routeInfo) {
              setLastDispatch({
                vehicleId: newPlate,
                spotId: target.id,
                route: routeInfo.routeDescription,
                eta: routeInfo.etaSec,
              });
            }

            newLedger.unshift({
              type: 'ENTRY',
              vehicleId: newPlate,
              spotId: target.id,
              floor: target.floor,
              time: timeStr,
              cycle: prev.cycle + 1,
            });

            notificationService.notifyVehicleEntry(
              newPlate,
              target.id,
              target.floor,
              routeInfo?.routeDescription,
              routeInfo?.etaSec
            );

            // Crear agente real de navegación hacia la plaza (sentido UP)
            const inRoute = getRouteForFloor(target.floor, false);
            navigatingRef.current.push({
              id: `NAV-IN-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              type: 'ENTRY',
              vehicleId: newPlate,
              vehicleType: vType,
              targetSpotId: target.id,
              targetFloor: target.floor,
              route: inRoute,
              stepIndex: 0,
              ticksInSegment: 0,
              currentSegment: inRoute[0],
              direction: 'UP',
              waitingAtRamp: null,
              isWaiting: false,
            });
          }
        }
      }

      const updatedFloors = computeFloorSummaries(updatedSpots);
      const totalOcc = updatedSpots.filter((s) => s.occ).length;

      // Auditoría continua de capacidad y plantas completas
      notificationService.checkFloorCapacity(updatedFloors, totalOcc, prev.totalSpots);

      // Dinámica de vehículos circulando en pasillos y rampas estrictamente según agentes reales
      const currentNavigating = navigatingRef.current;
      const updatedCorridors = prev.corridors.map((c) => {
        const activeInCorridor = currentNavigating.filter(
          (v) => (v.currentSegment === c.id || (v.route && v.route[v.stepIndex] === c.id)) && !v.isWaiting
        ).length;
        const waitingForCorridor = currentNavigating.filter(
          (v) => v.waitingAtRamp === c.id
        ).length;
        const totalVehicles = activeInCorridor + waitingForCorridor;

        const isJammed = (c.is_jammed || prev.isJamActive) && prev.jammedCorridor === c.id;
        const vehicles = isJammed ? Math.min(c.capacity, Math.max(totalVehicles, Math.floor(c.capacity * 0.95))) : totalVehicles;
        const density = isJammed ? 95 : Math.min(100, Math.round((vehicles / c.capacity) * 100));

        return { ...c, vehicles, density, is_jammed: isJammed };
      });

      return {
        ...prev,
        cycle: prev.cycle + 1,
        totalOccupied: totalOcc,
        totalAvailable: 400 - totalOcc,
        inTransit: currentNavigating.length,
        spots: updatedSpots,
        floors: updatedFloors,
        corridors: updatedCorridors,
        accessLedger: newLedger.slice(0, 20),
        lastUpdated: Date.now(),
      };
    });
  }, [isEmergency, smartDispatchEnabled]);

  // Suscripción al WebSocket de GAMA Server
  useEffect(() => {
    const handleSocketUpdate = (data) => {
      if (!data) return;

      if (data.type === 'CONNECTION_STATUS') {
        setIsConnected(data.isConnected);
        return;
      }

      if (data.type === 'PARKING_TELEMETRY_UPDATE') {
        if (data.floors?.length > 0) {
          notificationService.checkFloorCapacity(data.floors, data.totalOccupied, data.totalSpots || 400);
        }

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

  // Conmutador de Emergencia / Evacuación
  const handleToggleEmergency = useCallback(() => {
    setIsEmergency((prev) => {
      const next = !prev;
      notificationService.notifyEmergency(next, emergencyElapsed);
      if (next) {
        setEmergencyElapsed(0);
        setIsPlaying(true);
        if (!simTimerRef.current) {
          simTimerRef.current = setInterval(advanceSimulationStep, 1000);
        }
      }
      return next;
    });
  }, [advanceSimulationStep, emergencyElapsed]);

  // Ingreso Manual de Auto con Despacho Predictivo o Asignación Estándar
  const handleSpawnManual = useCallback(() => {
    gamaSocket.spawnManualVehicle();

    setTelemetry((prev) => {
      let targetSpot = null;
      let routeInfo = null;

      if (smartDispatchEnabled) {
        // Algoritmo SDTR: Despacho Predictivo global
        routeInfo = findOptimalSpotSmartDispatch(prev.spots, prev.corridors);
        if (routeInfo) {
          targetSpot = routeInfo.spot;
          setActiveFloor(targetSpot.floor); // Enfocar visualmente la planta óptima
        }
      }

      if (!targetSpot) {
        const availableInFloor = prev.spots.filter((s) => !s.occ && s.floor === activeFloor);
        targetSpot = availableInFloor.length > 0 ? availableInFloor[0] : prev.spots.find((s) => !s.occ);
      }

      if (!targetSpot) return prev;

      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const newPlate = `ARG-${Math.floor(100 + Math.random() * 900)}-M`;
      const vType = Math.random() < 0.3 ? '4X4' : 'AUTO';
      const randomStayHrs = [1, 2, 3, 4, 6, 8, 12][Math.floor(Math.random() * 7)];

      const updatedSpots = prev.spots.map((s) => {
        if (s.id === targetSpot.id) {
          return {
            ...s,
            occ: true,
            car: newPlate,
            vehicleType: vType,
            stayHours: randomStayHrs,
            t_in: timeStr,
            duration: randomStayHrs * 60,
          };
        }
        return s;
      });

      if (routeInfo) {
        setLastDispatch({
          vehicleId: newPlate,
          spotId: targetSpot.id,
          route: routeInfo.routeDescription,
          eta: routeInfo.etaSec,
        });
      }

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

      // Registrar agente de navegación hacia la plaza seleccionada
      const inRoute = getRouteForFloor(targetSpot.floor, false);
      navigatingRef.current.push({
        id: `NAV-IN-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type: 'ENTRY',
        vehicleId: newPlate,
        vehicleType: vType,
        targetSpotId: targetSpot.id,
        targetFloor: targetSpot.floor,
        route: inRoute,
        stepIndex: 0,
        ticksInSegment: 0,
        currentSegment: inRoute[0],
        direction: 'UP',
        waitingAtRamp: null,
        isWaiting: false,
      });

      // Auditoría y Notificaciones en tiempo real
      notificationService.notifyVehicleEntry(
        newPlate,
        targetSpot.id,
        targetSpot.floor,
        routeInfo?.routeDescription,
        routeInfo?.etaSec
      );
      notificationService.checkFloorCapacity(updatedFloors, totalOcc, prev.totalSpots);

      return {
        ...prev,
        cycle: prev.cycle + 1,
        totalOccupied: totalOcc,
        totalAvailable: 400 - totalOcc,
        inTransit: navigatingRef.current.length,
        spots: updatedSpots,
        floors: updatedFloors,
        accessLedger: [newLedgerEntry, ...prev.accessLedger.slice(0, 19)],
        lastUpdated: Date.now(),
      };
    });
  }, [activeFloor, smartDispatchEnabled]);

  // Simulación y despeje de atascamiento en rampas
  const handleTriggerJam = useCallback((corridor = 'RAMP_A_B') => {
    gamaSocket.triggerParkingJam(corridor);
    notificationService.notifyRampJam(true, corridor);
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
    notificationService.notifyRampJam(false, prev => prev?.jammedCorridor || 'RAMP_A_B');
    setTelemetry((prev) => ({
      ...prev,
      isJamActive: false,
      jammedCorridor: '',
      corridors: prev.corridors.map((c) =>
        c.id === prev.jammedCorridor ? { ...c, is_jammed: false, density: 0, vehicles: 0 } : c
      ),
    }));
  }, []);

  // Handlers para Búsqueda Peatonal ("¿Dónde dejé mi auto?")
  const handleVehicleFound = useCallback((spot) => {
    setActiveFloor(spot.floor);
    setSearchedSpotId(spot.id);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchedSpotId(null);
  }, []);

  // Handlers para Cobro y Facturación en Tiempo Real
  const handleOpenBilling = useCallback((spot) => {
    setBillingSpot(spot);
  }, []);

  const handleConfirmCheckout = useCallback(
    (spot, amount, timeOutStr) => {
      // Crear agente real de navegación hacia la salida (sentido DOWN)
      const exitRoute = getRouteForFloor(spot.floor, true);
      navigatingRef.current.push({
        id: `NAV-OUT-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type: 'EXIT',
        vehicleId: spot.car || 'ARG-000',
        vehicleType: spot.vehicleType || 'AUTO',
        targetSpotId: spot.id,
        targetFloor: spot.floor,
        route: exitRoute,
        stepIndex: 0,
        ticksInSegment: 0,
        currentSegment: exitRoute[0],
        direction: 'DOWN',
        waitingAtRamp: null,
        isWaiting: false,
      });

      setTelemetry((prev) => {
        const updatedSpots = prev.spots.map((s) => {
          if (s.id === spot.id) {
            return { ...s, occ: false, car: '', t_in: '', duration: 0 };
          }
          return s;
        });

        const updatedFloors = computeFloorSummaries(updatedSpots);
        const totalOcc = updatedSpots.filter((s) => s.occ).length;

        const exitEntry = {
          type: 'EXIT',
          vehicleId: spot.car,
          spotId: spot.id,
          floor: spot.floor,
          time: timeOutStr,
          fee: amount,
          durationSec: spot.duration > 0 ? spot.duration * 60 : 3600,
          cycle: prev.cycle + 1,
        };

        return {
          ...prev,
          cycle: prev.cycle + 1,
          totalOccupied: totalOcc,
          totalAvailable: 400 - totalOcc,
          inTransit: navigatingRef.current.length,
          spots: updatedSpots,
          floors: updatedFloors,
          accessLedger: [exitEntry, ...prev.accessLedger.slice(0, 19)],
          lastUpdated: Date.now(),
        };
      });

      notificationService.notifyVehicleExit(
        spot.car || 'ARG-000',
        spot.id,
        spot.floor,
        amount,
        spot.duration > 0 ? spot.duration * 60 : 3600
      );

      setAccumulatedRevenue((prev) => prev + amount);
      setBillingSpot(null);
      if (searchedSpotId === spot.id) {
        setSearchedSpotId(null);
      }
    },
    [searchedSpotId]
  );

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

      {/* Selector de Sub-Pantallas: Operación vs Notificaciones & Auditoría */}
      <div className="parking-view-subtabs">
        <button
          type="button"
          className={`parking-subtab-btn ${activeView === 'OPERATION' ? 'subtab-active' : ''}`}
          onClick={() => setActiveView('OPERATION')}
        >
          <span className="subtab-icon">🏢</span>
          <span>Operación y Plano 2D</span>
        </button>

        <button
          type="button"
          className={`parking-subtab-btn notif-tab-btn ${activeView === 'NOTIFICATIONS' ? 'subtab-active' : ''}`}
          onClick={() => setActiveView('NOTIFICATIONS')}
        >
          <span className="subtab-icon">🔔</span>
          <span>Centro de Notificaciones & Auditoría</span>
          {unreadAlertCount > 0 && (
            <span className="notif-badge-counter">{unreadAlertCount}</span>
          )}
        </button>
      </div>

      {activeView === 'NOTIFICATIONS' ? (
        <ParkingNotificationCenter
          floors={telemetry.floors}
          totalOccupied={telemetry.totalOccupied}
          totalSpots={telemetry.totalSpots}
          isEmergency={isEmergency}
          onBackToMap={() => setActiveView('OPERATION')}
        />
      ) : (
        <>
          {/* Protocolo de Evacuación Crítica de Emergencia (WCET) */}
          <EmergencyEvacuationPanel
            metrics={evacuationMetrics}
            onToggleEmergency={handleToggleEmergency}
          />

          {/* Controles de Simulación y Despacho Predictivo */}
          <ParkingControls
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onStep={handleStep}
            arrivalRate={telemetry.arrivalRate}
            onRateChange={handleRateChange}
            onSpawnManual={handleSpawnManual}
            disabled={false}
            smartDispatchEnabled={smartDispatchEnabled}
            onToggleSmartDispatch={setSmartDispatchEnabled}
            lastDispatch={lastDispatch}
          />

          {/* 1. Cartelería Digital de Aforo (General y por Planta con Flechas Roja/Verde) + KPI Recaudación */}
          <ParkingSignage
            totalOccupied={telemetry.totalOccupied}
            totalAvailable={telemetry.totalAvailable}
            totalSpots={telemetry.totalSpots}
            floors={telemetry.floors}
            accumulatedRevenue={accumulatedRevenue}
          />

          {/* 2. Control de Concurrencia en Rampas (Semáforos Mutex) */}
          <RampMutexIndicator
            mutexes={rampMutexes}
            isEmergency={isEmergency}
          />

          {/* 3. Tráfico Interno y Detección de Atascamientos */}
          <InternalTrafficMonitor
            corridors={telemetry.corridors}
            inTransit={telemetry.inTransit}
            isJamActive={telemetry.isJamActive}
            onTriggerJam={handleTriggerJam}
            onClearJam={handleClearJam}
          />

          {/* 4. Buscador Inteligente de Vehículo ("¿Dónde dejé mi auto?") */}
          <VehicleFinderBar
            spots={telemetry.spots}
            activeSearchSpot={telemetry.spots.find((s) => s.id === searchedSpotId)}
            onVehicleFound={handleVehicleFound}
            onClearSearch={handleClearSearch}
          />

          {/* 5. Plano Arquitectónico 2D y Grilla de 100 Plazas */}
          <ParkingFloorMap
            spots={telemetry.spots}
            activeFloor={activeFloor}
            onFloorChange={setActiveFloor}
            isJamActive={telemetry.isJamActive}
            inTransit={telemetry.inTransit}
            isEmergency={isEmergency}
            searchedSpotId={searchedSpotId}
            onOpenBilling={handleOpenBilling}
          />

          {/* 6. Bitácora Temporal y Control de Accesos (T_in / T_out) */}
          <AccessLedger
            ledger={telemetry.accessLedger}
          />
        </>
      )}

      {/* Modal Digital de Facturación y Cobro de Salida */}
      {billingSpot && (
        <ParkingBillingModal
          spot={billingSpot}
          onConfirmCheckout={handleConfirmCheckout}
          onClose={() => setBillingSpot(null)}
        />
      )}
    </div>
  );
});

export default ParkingDashboard;

