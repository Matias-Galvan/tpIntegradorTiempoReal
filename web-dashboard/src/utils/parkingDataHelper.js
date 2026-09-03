/**
 * parkingDataHelper.js
 * Generador y gestor de datos para el Estacionamiento Inteligente (4 Plantas, 400 Plazas).
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

