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
  'AG 610 CC', 'AD 829 JJ', 'AC 105 BR', 'AF 440 KK', 'AA 772 PQ',
];

// Distribución de estadías realistas en horas para los vehículos estacionados
const STAY_HOURS_SAMPLE = [1, 2, 2, 3, 4, 4, 5, 6, 8, 10, 12, 12, 14, 18, 24];

/**
 * Genera la estructura inicial completa de las 400 plazas (100 por planta)
 * garantizando coherencia con los carteles de aforo desde el primer milisegundo.
 * Asigna tipo de vehículo (Auto vs 4x4) y estadías variadas en horas.
 */
export function generateInitialParkingSpots() {
  const allSpots = [];

  FLOORS.forEach((floor) => {
    const targetOccupied = INITIAL_OCCUPANCY[floor] || 30;

    for (let i = 1; i <= SPOTS_PER_FLOOR; i++) {
      const isOccupied = i <= targetOccupied;
      const plate = isOccupied ? RANDOM_PLATES[(i * 3 + floor.charCodeAt(0)) % RANDOM_PLATES.length] : '';

      // Tipo de vehículo: ~30% Camionetas 4x4, ~70% Autos
      const vehicleType = (i % 3 === 0) ? '4X4' : 'AUTO';

      // Estadía en horas variada
      const stayHours = isOccupied ? STAY_HOURS_SAMPLE[(i + floor.charCodeAt(0)) % STAY_HOURS_SAMPLE.length] : 0;
      const extraMinutes = isOccupied ? ((i * 7) % 55) : 0;
      const totalDurationMinutes = isOccupied ? stayHours * 60 + extraMinutes : 0;

      // Generar hora de entrada coherente con la estadía (restando horas a la hora actual ~20:00)
      const inHour = isOccupied ? Math.max(0, (20 - stayHours) % 24) : 0;
      const inMinute = isOccupied ? Math.floor(10 + (i * 1.3) % 45) : 0;
      const inSecond = isOccupied ? Math.floor((i * 7) % 60) : 0;
      const timeStr = isOccupied
        ? `${inHour.toString().padStart(2, '0')}:${inMinute.toString().padStart(2, '0')}:${inSecond.toString().padStart(2, '0')}`
        : '';

      const spotType = i <= 6 ? 'PMR' : i <= 14 ? 'EV' : 'STANDARD';
      const batteryLevel = spotType === 'EV' && isOccupied ? Math.floor(30 + (i * 9) % 65) : 0;

      allSpots.push({
        id: `${floor}-${i}`,
        floor,
        num: i,
        occ: isOccupied,
        car: plate,
        vehicleType, // 'AUTO' | '4X4'
        stayHours,
        t_in: timeStr,
        duration: totalDurationMinutes, // duración en minutos
        spotType,
        batteryLevel,
        chargePowerKw: spotType === 'EV' ? 22 : 0,
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

    const availablePmr = floorSpots.filter((s) => s.spotType === 'PMR' && !s.occ).length;
    const availableEv = floorSpots.filter((s) => s.spotType === 'EV' && !s.occ).length;

    return {
      floor: f,
      name: `Planta ${f} (Nivel ${f.charCodeAt(0) - 64})`,
      occupied,
      available,
      availablePmr,
      availableEv,
      total: floorSpots.length || SPOTS_PER_FLOOR,
    };
  });
}

/**
 * Cálculo del costo de estacionamiento y cobro digital (Tarifación oficial SDTR)
 * Cuadro Tarifario Vigente:
 * - Autos (Sedán / Compacto): Tarifa por hora $1.400 • Promo Estadía 12h: $14.000 • Estadía 24h: $24.000
 * - Camionetas 4x4 / Pick-up / SUV: Tarifa por hora $2.800 • Promo Estadía 12h: $28.000 • Estadía 24h: $48.000
 */
export function calculateParkingFee(durationMinutes = 60, vehicleType = 'AUTO', spotType = 'STANDARD') {
  const is4x4 = vehicleType === '4X4';
  const baseHourlyRate = is4x4 ? 2800 : 1400; // $1.400 auto / $2.800 4x4
  const hours = Math.max(1, Math.ceil(durationMinutes / 60));

  let baseSubtotal;
  let isPromoApplied = false;
  let promoName = null;
  let promoSavings = 0;

  const normalCost = hours * baseHourlyRate;

  if (hours >= 24) {
    // Estadía 24h (Día completo)
    const promo24hRate = is4x4 ? 48000 : 24000;
    const extraHours = hours - 24;
    baseSubtotal = promo24hRate + (extraHours * baseHourlyRate);
    if (baseSubtotal < normalCost) {
      isPromoApplied = true;
      promoName = `⭐ Promo Estadía 24h (${is4x4 ? '$48.000' : '$24.000'})`;
      promoSavings = normalCost - baseSubtotal;
    }
  } else if (hours >= 12) {
    // Estadía 12h
    const promo12hRate = is4x4 ? 28000 : 14000;
    const extraHours = hours - 12;
    baseSubtotal = promo12hRate + (extraHours * baseHourlyRate);
    if (baseSubtotal < normalCost) {
      isPromoApplied = true;
      promoName = `⭐ Promo Estadía 12h (${is4x4 ? '$28.000' : '$14.000'})`;
      promoSavings = normalCost - baseSubtotal;
    }
  } else {
    baseSubtotal = normalCost;
  }

  // Bonificaciones especiales
  let discount = 0;
  let chargingFee = 0;

  if (spotType === 'PMR') {
    discount = 0.5; // 50% de bonificación para Movilidad Reducida
  } else if (spotType === 'EV') {
    chargingFee = hours * 450; // $450 ARS/h de carga eléctrica
  }

  const discountAmount = Math.round(baseSubtotal * discount);
  const totalAmount = Math.max(0, Math.round(baseSubtotal - discountAmount + chargingFee));

  const formatHours = Math.floor(durationMinutes / 60);
  const formatMins = durationMinutes % 60;
  const formattedDuration = `${formatHours > 0 ? `${formatHours}h ` : ''}${formatMins}m`;

  return {
    durationMinutes,
    hours,
    vehicleType: is4x4 ? '4X4' : 'AUTO',
    vehicleLabel: is4x4 ? 'Camioneta 4x4 / Pick-up' : 'Auto / Sedán / Hatchback',
    baseHourlyRate,
    normalCost,
    baseSubtotal,
    isPromoApplied,
    promoName,
    promoSavings,
    discountPercent: Math.round(discount * 100),
    discountAmount,
    chargingFee,
    totalAmount,
    formattedDuration,
  };
}

/**
 * Registros iniciales de accesos para la bitácora
 */
export function generateInitialAccessLedger() {
  return [
    { type: 'ENTRY', vehicleId: 'AB 123 CD', vehicleType: 'AUTO', spotId: 'A-1', floor: 'A', time: '08:12:10', cycle: 1, spotType: 'PMR' },
    { type: 'ENTRY', vehicleId: 'AA 948 XP', vehicleType: '4X4', spotId: 'A-8', floor: 'A', time: '08:14:45', cycle: 2, spotType: 'EV' },
    { type: 'EXIT', vehicleId: 'RT 441 QS', vehicleType: 'AUTO', spotId: 'B-12', floor: 'B', time: '08:18:20', durationSec: 720, cycle: 3, fee: 14000 },
    { type: 'ENTRY', vehicleId: 'AF 502 KL', vehicleType: 'AUTO', spotId: 'B-5', floor: 'B', time: '08:21:05', cycle: 4, spotType: 'PMR' },
    { type: 'ENTRY', vehicleId: 'PL 897 MD', vehicleType: '4X4', spotId: 'C-22', floor: 'C', time: '08:25:33', cycle: 5, spotType: 'STANDARD' },
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

/**
 * Retorna la secuencia ordenada de identificadores de pasillos y rampas para un piso dado.
 * Si isExit es true, invierte el orden para el trayecto de descenso hacia la salida en Planta A.
 */
export function getRouteForFloor(floor = 'A', isExit = false) {
  let segments = ['AISLE_A'];
  if (floor === 'B') {
    segments = ['AISLE_A', 'RAMP_A_B', 'AISLE_B'];
  } else if (floor === 'C') {
    segments = ['AISLE_A', 'RAMP_A_B', 'AISLE_B', 'RAMP_B_C', 'AISLE_C'];
  } else if (floor === 'D') {
    segments = ['AISLE_A', 'RAMP_A_B', 'AISLE_B', 'RAMP_B_C', 'AISLE_C', 'RAMP_C_D', 'AISLE_D'];
  }
  return isExit ? [...segments].reverse() : segments;
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
      directionTimer: 15,
      maxPhaseSeconds: 15,
      waitingUp: 0,
      waitingDown: 0,
      activeVehicles: 0,
      isDeadlockRisk: false,
      lastDirection: 'UP',
    },
    {
      id: 'RAMP_B_C',
      name: 'Rampa Planta B ⇄ C',
      state: 'DOWN',
      directionTimer: 10,
      maxPhaseSeconds: 15,
      waitingUp: 0,
      waitingDown: 0,
      activeVehicles: 0,
      isDeadlockRisk: false,
      lastDirection: 'DOWN',
    },
    {
      id: 'RAMP_C_D',
      name: 'Rampa Planta C ⇄ D',
      state: 'UP',
      directionTimer: 15,
      maxPhaseSeconds: 15,
      waitingUp: 0,
      waitingDown: 0,
      activeVehicles: 0,
      isDeadlockRisk: false,
      lastDirection: 'UP',
    },
  ];
}

/**
 * Ejecuta un ciclo de la máquina de estados del semáforo Mutex de rampa
 * Vinculado a los vehículos reales en tránsito (navigatingVehicles)
 */
export function stepRampMutexes(mutexes = [], navigatingVehicles = [], isEmergency = false) {
  return mutexes.map((m) => {
    // Si hay evacuación de emergencia, forzar rampa a descenso exclusivo inmediatamente
    if (isEmergency) {
      const activeDesc = navigatingVehicles.filter((v) => v.currentSegment === m.id).length;
      const waitingDesc = navigatingVehicles.filter((v) => v.waitingAtRamp === m.id && v.direction === 'DOWN').length;

      return {
        ...m,
        state: 'DOWN',
        directionTimer: 999,
        waitingUp: 0,
        waitingDown: waitingDesc,
        activeVehicles: activeDesc,
        isDeadlockRisk: false,
      };
    }

    // Calcular colas y vehículos activos en base a agentes reales en tránsito
    const onRamp = navigatingVehicles.filter((v) => {
      const seg = v.currentSegment || (v.route && v.route[v.stepIndex]);
      return seg === m.id && !v.isWaiting;
    }).length;
    const queuedUp = navigatingVehicles.filter((v) => v.waitingAtRamp === m.id && v.direction === 'UP').length;
    const queuedDown = navigatingVehicles.filter((v) => v.waitingAtRamp === m.id && v.direction === 'DOWN').length;

    let nextTimer = m.directionTimer - 1;
    let nextState = m.state;
    let lastDir = m.lastDirection || 'UP';

    // Algoritmo SDTR Demand-Actuated (Control Sensible a la Demanda):
    // Si la rampa está libre (onRamp === 0) y no hay vehículos en el sentido actual pero sí en el opuesto,
    // acelerar la conmutación a CLEARING para no hacer esperar innecesariamente a los vehículos.
    if (m.state === 'UP' && queuedUp === 0 && onRamp === 0 && queuedDown > 0 && nextTimer > 2) {
      nextTimer = 1; // Disparar conmutación inmediata
    } else if (m.state === 'DOWN' && queuedDown === 0 && onRamp === 0 && queuedUp > 0 && nextTimer > 2) {
      nextTimer = 1; // Disparar conmutación inmediata
    }

    if (nextTimer <= 0) {
      if (m.state === 'UP') {
        nextState = 'CLEARING';
        nextTimer = 2; // 2 segundos de vaciado preventivo
        lastDir = 'UP';
      } else if (m.state === 'DOWN') {
        nextState = 'CLEARING';
        nextTimer = 2;
        lastDir = 'DOWN';
      } else if (m.state === 'CLEARING') {
        // Conmutar a la dirección opuesta a la última activa (o priorizar sentido con demanda)
        if (queuedDown > 0 && queuedUp === 0) {
          nextState = 'DOWN';
          nextTimer = m.maxPhaseSeconds || 12;
          lastDir = 'DOWN';
        } else if (queuedUp > 0 && queuedDown === 0) {
          nextState = 'UP';
          nextTimer = m.maxPhaseSeconds || 12;
          lastDir = 'UP';
        } else if (lastDir === 'UP') {
          nextState = 'DOWN';
          nextTimer = m.maxPhaseSeconds || 12;
          lastDir = 'DOWN';
        } else {
          nextState = 'UP';
          nextTimer = m.maxPhaseSeconds || 12;
          lastDir = 'UP';
        }
      }
    }

    const deadlockRisk = queuedUp >= 3 && queuedDown >= 3;

    return {
      ...m,
      state: nextState,
      directionTimer: nextTimer,
      waitingUp: queuedUp,
      waitingDown: queuedDown,
      activeVehicles: onRamp,
      isDeadlockRisk: deadlockRisk,
      lastDirection: lastDir,
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
