/**
 * parkingDataHelper.js
 * Generador y gestor de datos para el Estacionamiento Inteligente (4 Plantas, 400 Plazas).
 * Incorpora algoritmos SDTR:
 * - Algoritmo de Despacho Predictivo (Smart Dispatching).
 * - Semáforos Mutex para Control de Concurrencia en Rampas (Deadlock Prevention).
 * - Cálculo analítico de Tiempo de Peor Caso de Evacuación (WCET).
 */

const FLOORS = ['A', 'B', 'C', 'D'];
const SPOTS_PER_FLOOR = 100;

// Distribución inicial realista por planta
const INITIAL_OCCUPANCY = {
  A: 35,
  B: 42,
  C: 38,
  D: 25,
};

const RANDOM_PLATES = [
  'AB 123 CD', 'AA 948 XP', 'AF 502 KL', 'AE 714 TR', 'AD 331 NM',
  'AC 882 QW', 'AG 419 OP', 'AB 650 ZX', 'AA 215 LK', 'AF 930 MN',
  'PL 897 MD', 'RT 441 QS', 'VW 702 XY', 'BN 312 KP', 'ZX 904 TT',
];

/**
 * Genera la estructura inicial completa de las 400 plazas (100 por planta)
 * garantizando coherencia con los carteles de aforo desde el primer milisegundo.
 */
export function generateInitialParkingSpots() {
  const allSpots = [];

  FLOORS.forEach((floor) => {
    const targetOccupied = INITIAL_OCCUPANCY[floor] || 30;

    for (let i = 1; i <= SPOTS_PER_FLOOR; i++) {
      const isOccupied = i <= targetOccupied;
      const plate = isOccupied ? RANDOM_PLATES[(i * 3 + floor.charCodeAt(0)) % RANDOM_PLATES.length] : '';
      
      const hour = 8;
      const minute = Math.floor(10 + (i * 1.3) % 45);
      const second = Math.floor((i * 7) % 60);
      const timeStr = isOccupied
        ? `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`
        : '';

      allSpots.push({
        id: `${floor}-${i}`,
        floor,
        num: i,
        occ: isOccupied,
        car: plate,
        t_in: timeStr,
        duration: isOccupied ? Math.floor(30 + (i * 11) % 150) : 0,
      });
    }
  });

  return allSpots;
}

/**
 * Calcula los resúmenes de aforo por planta en base al listado de 400 puestos
 */
export function computeFloorSummaries(spots = []) {
  return FLOORS.map((f) => {
    const floorSpots = spots.filter((s) => s.floor === f);
    const occupied = floorSpots.filter((s) => s.occ).length;
    const available = floorSpots.length - occupied;

    return {
      floor: f,
      name: `Planta ${f} (Nivel ${f.charCodeAt(0) - 64})`,
      occupied,
      available,
      total: floorSpots.length || SPOTS_PER_FLOOR,
    };
  });
}

/**
 * Registros iniciales de accesos para la bitácora
 */
export function generateInitialAccessLedger() {
  return [
    { type: 'ENTRY', vehicleId: 'AB 123 CD', spotId: 'A-1', floor: 'A', time: '08:12:10', cycle: 1 },
    { type: 'ENTRY', vehicleId: 'AA 948 XP', spotId: 'A-2', floor: 'A', time: '08:14:45', cycle: 2 },
    { type: 'EXIT', vehicleId: 'RT 441 QS', spotId: 'B-12', floor: 'B', time: '08:18:20', durationSec: 240, cycle: 3 },
    { type: 'ENTRY', vehicleId: 'AF 502 KL', spotId: 'B-5', floor: 'B', time: '08:21:05', cycle: 4 },
    { type: 'ENTRY', vehicleId: 'PL 897 MD', spotId: 'C-8', floor: 'C', time: '08:25:33', cycle: 5 },
  ];
}

// ============================================================================
// 1. Algoritmo SDTR: Despacho Predictivo Inteligente (Smart Dispatching)
// ============================================================================

/**
 * Evalúa la función de costo J(P, F) para encontrar la plaza óptima global:
 * J(P, F) = alpha * DistanciaPiso + beta * CongestionRampas + gamma * SaturacionPlanta
 */
export function findOptimalSpotSmartDispatch(spots = [], corridors = []) {
  const freeSpots = spots.filter((s) => !s.occ);
  if (freeSpots.length === 0) return null;

  // Factores de congestión de rampas
  const rampAB = corridors.find((c) => c.id === 'RAMP_A_B')?.density || 15;
  const rampBC = corridors.find((c) => c.id === 'RAMP_B_C')?.density || 10;
  const rampCD = corridors.find((c) => c.id === 'RAMP_C_D')?.density || 5;

  let bestSpot = null;
  let minCost = Infinity;
  let bestRoute = '';
  let bestEta = 0;

  for (const spot of freeSpots) {
    // 1. Costo por distancia vertical
    const floorIndex = FLOORS.indexOf(spot.floor);
    const verticalDistCost = floorIndex * 25;

    // 2. Costo acumulado de rampas intermedias
    let rampCost = 0;
    let etaSec = 4; // base en planta A

    if (floorIndex >= 1) {
      rampCost += rampAB * 0.4;
      etaSec += 6;
    }
    if (floorIndex >= 2) {
      rampCost += rampBC * 0.4;
      etaSec += 6;
    }
    if (floorIndex >= 3) {
      rampCost += rampCD * 0.4;
      etaSec += 6;
    }

    // 3. Costo por ubicación dentro de la planta (puestos cerca de pasillo vs extremos)
    const bayDistance = Math.abs((spot.num % 25) - 12);
    const spotDistCost = bayDistance * 0.8;
    etaSec += Math.round(bayDistance * 0.3);

    // Función de costo total J(P, F)
    const totalCost = verticalDistCost + rampCost + spotDistCost;

    if (totalCost < minCost) {
      minCost = totalCost;
      bestSpot = spot;
      bestEta = etaSec;
      bestRoute = floorIndex === 0
        ? 'Directo por Pasillo Planta A'
        : `Rampa A->B ${floorIndex >= 2 ? '-> Rampa B->C ' : ''}${floorIndex >= 3 ? '-> Rampa C->D ' : ''}-> Puesto ${spot.id}`;
    }
  }

  return {
    spot: bestSpot,
    costScore: Math.round(minCost),
    etaSec: bestEta,
    routeDescription: bestRoute,
  };
}

// ============================================================================
// 2. Control de Concurrencia SDTR: Semáforos Mutex en Rampas
// ============================================================================

export function getInitialRampMutexes() {
  return [
    {
      id: 'RAMP_A_B',
      name: 'Rampa Planta A ⇄ B',
      state: 'UP', // UP | DOWN | CLEARING
      directionTimer: 12, // segundos restantes en esta fase
      maxPhaseSeconds: 15,
      waitingUp: 2,
      waitingDown: 1,
      activeVehicles: 1,
      isDeadlockRisk: false,
    },
    {
      id: 'RAMP_B_C',
      name: 'Rampa Planta B ⇄ C',
      state: 'DOWN',
      directionTimer: 8,
      maxPhaseSeconds: 15,
      waitingUp: 0,
      waitingDown: 2,
      activeVehicles: 1,
      isDeadlockRisk: false,
    },
    {
      id: 'RAMP_C_D',
      name: 'Rampa Planta C ⇄ D',
      state: 'UP',
      directionTimer: 14,
      maxPhaseSeconds: 15,
      waitingUp: 1,
      waitingDown: 0,
      activeVehicles: 0,
      isDeadlockRisk: false,
    },
  ];
}

/**
 * Ejecuta un ciclo de la máquina de estados del semáforo Mutex de rampa
 */
export function stepRampMutexes(mutexes = [], isEmergency = false) {
  return mutexes.map((m) => {
    // Si hay evacuación de emergencia, forzar rampa a descenso exclusivo inmediatamente
    if (isEmergency) {
      return {
        ...m,
        state: 'DOWN',
        directionTimer: 999,
        waitingUp: 0,
        waitingDown: Math.max(0, m.waitingDown - 1),
        activeVehicles: Math.min(6, m.activeVehicles + 1),
        isDeadlockRisk: false,
      };
    }

    let nextTimer = m.directionTimer - 1;
    let nextState = m.state;
    let nextWaitingUp = m.waitingUp;
    let nextWaitingDown = m.waitingDown;

    // Llegadas estocásticas a colas de espera
    if (Math.random() < 0.25) nextWaitingUp = Math.min(6, nextWaitingUp + 1);
    if (Math.random() < 0.20) nextWaitingDown = Math.min(6, nextWaitingDown + 1);

    if (nextTimer <= 0) {
      if (m.state === 'UP') {
        nextState = 'CLEARING';
        nextTimer = 3; // 3 segundos de intervalo de vaciado preventivo
      } else if (m.state === 'CLEARING') {
        nextState = 'DOWN';
        nextTimer = m.maxPhaseSeconds;
      } else if (m.state === 'DOWN') {
        nextState = 'CLEARING';
        nextTimer = 3;
      }
    }

    // Despacho de vehículos según fase habilitada
    let nextActive = m.activeVehicles;
    if (nextState === 'UP' && nextWaitingUp > 0 && Math.random() < 0.6) {
      nextWaitingUp -= 1;
      nextActive = Math.min(4, nextActive + 1);
    } else if (nextState === 'DOWN' && nextWaitingDown > 0 && Math.random() < 0.6) {
      nextWaitingDown -= 1;
      nextActive = Math.min(4, nextActive + 1);
    } else if (nextState === 'CLEARING') {
      nextActive = Math.max(0, nextActive - 1);
    }

    const deadlockRisk = nextWaitingUp >= 5 && nextWaitingDown >= 5;

    return {
      ...m,
      state: nextState,
      directionTimer: nextTimer,
      waitingUp: nextWaitingUp,
      waitingDown: nextWaitingDown,
      activeVehicles: nextActive,
      isDeadlockRisk: deadlockRisk,
    };
  });
}

// ============================================================================
// 3. Protocolo SDTR: Medición de Peor Caso de Evacuación (WCET)
// ============================================================================

export function computeEvacuationMetrics(totalOccupied = 140, elapsedSeconds = 0, isEmergencyActive = false) {
  const CRITICAL_DEADLINE_SEC = 180; // Tiempo límite crítico reglamentario (3 minutos)
  
  // Tasa de descarga estimada: 2.2 vehículos/segundo con todas las salidas y rampas abiertas
  const theoreticalWcetSec = Math.ceil(totalOccupied / 2.2) + 12;

  const remaining = isEmergencyActive
    ? Math.max(0, totalOccupied - Math.floor(elapsedSeconds * 2.2))
    : totalOccupied;

  const evacuated = totalOccupied - remaining;
  const progressPercent = totalOccupied > 0 ? Math.round((evacuated / totalOccupied) * 100) : 100;
  const deadlineMet = elapsedSeconds <= CRITICAL_DEADLINE_SEC;

  return {
    isEmergencyActive,
    criticalDeadlineSec: CRITICAL_DEADLINE_SEC,
    theoreticalWcetSec,
    elapsedSeconds,
    evacuatedCount: evacuated,
    remainingCount: remaining,
    progressPercent,
    deadlineMet,
    status: remaining === 0
      ? 'COMPLETADA'
      : elapsedSeconds > CRITICAL_DEADLINE_SEC
        ? 'DEADLINE_EXCEEDED'
        : 'EN_PROGRESO',
  };
}
