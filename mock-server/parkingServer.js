/**
 * Servidor WebSocket Mock para Estacionamiento Inteligente (SDTR - 4 Plantas)
 * Implementación en Node.js puro (CERO DEPENDENCIAS)
 *
 * Características:
 * - Escucha en ws://localhost:6868
 * - 4 Plantas (A, B, C, D) con 100 plazas cada una (400 plazas totales).
 * - Identificadores normalizados: A-1 a A-100, B-1 a B-100, C-1 a C-100, D-1 a D-100.
 * - Registro exacto de entradas (T_in) y salidas (T_out).
 * - Monitoreo de pasillos y rampas con detector y simulación de atascamiento.
 * - Emisión periódica de PARKING_TELEMETRY_UPDATE.
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = 6868;

// Estado del Estacionamiento
let isRunning = true;
let cycle = 0;
let arrivalRate = 0.5; // probabilidad de llegada
let isJamActive = false;
let jammedCorridor = '';
let simulationInterval = null;

const FLOORS = ['A', 'B', 'C', 'D'];
const SPOTS_PER_FLOOR = 100;
const TOTAL_SPOTS = 400;

// Inicialización de las 400 plazas
const spots = [];
FLOORS.forEach((floor) => {
  for (let num = 1; num <= SPOTS_PER_FLOOR; num++) {
    spots.push({
      id: `${floor}-${num}`,
      floor,
      num,
      occ: false,
      car: '',
      t_in: '',
      parkedDuration: 0,
    });
  }
});

// Ocupación inicial realista (~35% = 140 autos)
function randomLicense() {
  const letters = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const l1 = letters[Math.floor(Math.random() * letters.length)];
  const l2 = letters[Math.floor(Math.random() * letters.length)];
  const num = Math.floor(100 + Math.random() * 900);
  const l3 = letters[Math.floor(Math.random() * letters.length)];
  const l4 = letters[Math.floor(Math.random() * letters.length)];
  return `${l1}${l2} ${num} ${l3}${l4}`;
}

function getExactTimeString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// Llenar 140 plazas aleatorias al inicio
const shuffledSpots = [...spots].sort(() => 0.5 - Math.random());
for (let i = 0; i < 140; i++) {
  shuffledSpots[i].occ = true;
  shuffledSpots[i].car = randomLicense();
  const pastMinutes = Math.floor(10 + Math.random() * 90);
  const entryDate = new Date(Date.now() - pastMinutes * 60000);
  shuffledSpots[i].t_in = getExactTimeString(entryDate);
  shuffledSpots[i].parkedDuration = pastMinutes * 60;
}

// Pasillos y Rampas
const corridors = [
  { id: 'RAMP_A_B', name: 'Rampa Planta A -> B', isRamp: true, capacity: 8, vehicles: 1, density: 12, isJammed: false },
  { id: 'RAMP_B_C', name: 'Rampa Planta B -> C', isRamp: true, capacity: 8, vehicles: 0, density: 0, isJammed: false },
  { id: 'RAMP_C_D', name: 'Rampa Planta C -> D', isRamp: true, capacity: 8, vehicles: 0, density: 0, isJammed: false },
  { id: 'AISLE_A', name: 'Pasillo Principal Planta A', isRamp: false, capacity: 14, vehicles: 2, density: 14, isJammed: false },
  { id: 'AISLE_B', name: 'Pasillo Principal Planta B', isRamp: false, capacity: 14, vehicles: 1, density: 7, isJammed: false },
  { id: 'AISLE_C', name: 'Pasillo Principal Planta C', isRamp: false, capacity: 14, vehicles: 1, density: 7, isJammed: false },
  { id: 'AISLE_D', name: 'Pasillo Principal Planta D', isRamp: false, capacity: 14, vehicles: 0, density: 0, isJammed: false },
];

// Bitácora de accesos en tiempo real
const accessLedger = [
  { type: 'ENTRY', vehicleId: 'AF 821 KN', spotId: 'B-14', floor: 'B', time: '14:20:12', durationSec: null },
  { type: 'ENTRY', vehicleId: 'AE 392 LP', spotId: 'A-78', floor: 'A', time: '14:21:45', durationSec: null },
  { type: 'EXIT', vehicleId: 'AD 104 XM', spotId: 'C-02', floor: 'C', time: '14:22:10', durationSec: 2840 },
];

// Conexiones WebSocket activas
const clients = new Set();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('GAMA Smart Parking Server Mock (SDTR 4 Plantas) en puerto ' + PORT);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const digest = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${digest}`,
    '\r\n',
  ];

  socket.write(headers.join('\r\n'));
  clients.add(socket);
  console.log(`[Parking Mock] Cliente conectado (${req.socket.remoteAddress}). Total clientes: ${clients.size}`);

  // Enviar mensaje de bienvenida GAMA
  sendJson(socket, { type: 'ConnectionSuccessful', content: 'PARKING-MOCK-SOCKET' });
  sendJson(socket, { type: 'CommandExecutedSuccessfully', content: '7777', command: { type: 'load' } });

  // Enviar telemetría inmediata
  sendTelemetryToClient(socket);

  let frameBuffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);
    while (frameBuffer.length >= 2) {
      const secondByte = frameBuffer[1];
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (frameBuffer.length < 4) break;
        payloadLength = frameBuffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (frameBuffer.length < 10) break;
        payloadLength = Number(frameBuffer.readBigUInt64BE(2));
        offset = 10;
      }

      let maskingKey = null;
      if (isMasked) {
        if (frameBuffer.length < offset + 4) break;
        maskingKey = frameBuffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const totalFrameSize = offset + payloadLength;
      if (frameBuffer.length < totalFrameSize) break;

      const payload = frameBuffer.subarray(offset, totalFrameSize);
      frameBuffer = frameBuffer.subarray(totalFrameSize);

      let decoded = Buffer.from(payload);
      if (isMasked && maskingKey) {
        for (let i = 0; i < decoded.length; i++) {
          decoded[i] ^= maskingKey[i % 4];
        }
      }

      processCommand(decoded.toString('utf-8'));
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    console.log('[Parking Mock] Cliente desconectado.');
  });

  socket.on('error', () => {
    clients.delete(socket);
  });
});

function processCommand(rawMessage) {
  try {
    const cmd = JSON.parse(rawMessage);
    console.log('[Parking Mock] Comando recibido:', cmd);

    const type = cmd.type || cmd.command;

    if (type === 'play') {
      isRunning = true;
      console.log('[Parking Mock] ▶ Simulación INICIADA');
    } else if (type === 'pause') {
      isRunning = false;
      console.log('[Parking Mock] ⏸ Simulación PAUSADA');
    } else if (type === 'step') {
      stepSimulation();
    } else if (type === 'ask') {
      let args = cmd.args;
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch {}
      }

      if (cmd.action === 'set_arrival_rate_cmd' && args?.new_rate !== undefined) {
        arrivalRate = Number(args.new_rate);
        console.log(`[Parking Mock] Tasa de arribos actualizada a: ${arrivalRate}`);
      } else if (cmd.action === 'trigger_jam_cmd') {
        isJamActive = true;
        jammedCorridor = args?.corridor_target || 'RAMP_A_B';
        console.log(`[Parking Mock] ⚠️ Atascamiento inducido en: ${jammedCorridor}`);
      } else if (cmd.action === 'clear_jam_cmd') {
        isJamActive = false;
        jammedCorridor = '';
        console.log('[Parking Mock] ✓ Atascamiento despejado.');
      } else if (cmd.action === 'spawn_manual_vehicle') {
        spawnIncomingVehicle();
      }
      broadcastTelemetry();
    }
  } catch (e) {
    console.warn('[Parking Mock] Error procesando comando:', e);
  }
}

function spawnIncomingVehicle() {
  const freeSpots = spots.filter((s) => !s.occ);
  if (freeSpots.length === 0) return null;

  const target = freeSpots[Math.floor(Math.random() * freeSpots.length)];
  target.occ = true;
  target.car = randomLicense();
  target.t_in = getExactTimeString();
  target.parkedDuration = 0;

  accessLedger.unshift({
    type: 'ENTRY',
    vehicleId: target.car,
    spotId: target.id,
    floor: target.floor,
    time: target.t_in,
    durationSec: null,
  });
  if (accessLedger.length > 25) accessLedger.pop();

  return target;
}

function handleVehicleExit() {
  const occupiedSpots = spots.filter((s) => s.occ && s.parkedDuration > 15);
  if (occupiedSpots.length === 0) return;

  const leaving = occupiedSpots[Math.floor(Math.random() * occupiedSpots.length)];
  const duration = leaving.parkedDuration;
  const exitTime = getExactTimeString();

  accessLedger.unshift({
    type: 'EXIT',
    vehicleId: leaving.car,
    spotId: leaving.id,
    floor: leaving.floor,
    time: exitTime,
    durationSec: duration,
  });
  if (accessLedger.length > 25) accessLedger.pop();

  leaving.occ = false;
  leaving.car = '';
  leaving.t_in = '';
  leaving.parkedDuration = 0;
}

function stepSimulation() {
  cycle += 1;

  // Incrementar duración de todos los autos estacionados
  spots.forEach((s) => {
    if (s.occ) s.parkedDuration += 2;
  });

  // Arribos periódicos según arrivalRate
  if (Math.random() < arrivalRate) {
    spawnIncomingVehicle();
  }

  // Egresos periódicos
  if (Math.random() < 0.35) {
    handleVehicleExit();
  }

  // Actualizar dinámica de pasillos y rampas
  const inTransitCount = isJamActive ? 14 : Math.floor(3 + Math.random() * 5);
  corridors.forEach((c) => {
    if (isJamActive && c.id === jammedCorridor) {
      c.vehicles = Math.min(c.capacity, Math.floor(c.capacity * 0.95));
      c.density = 95;
      c.isJammed = true;
    } else {
      c.vehicles = Math.floor(Math.random() * (c.capacity * 0.35));
      c.density = Math.round((c.vehicles / c.capacity) * 100);
      c.isJammed = c.density >= 75;
    }
  });

  broadcastTelemetry();
}

function generateTelemetryPayload() {
  const totalOccupied = spots.filter((s) => s.occ).length;
  const totalAvailable = TOTAL_SPOTS - totalOccupied;

  const floorStats = FLOORS.map((floor) => {
    const floorSpots = spots.filter((s) => s.floor === floor);
    const occ = floorSpots.filter((s) => s.occ).length;
    return {
      floor,
      occupied: occ,
      available: SPOTS_PER_FLOOR - occ,
      total: SPOTS_PER_FLOOR,
    };
  });

  return {
    type: 'PARKING_TELEMETRY_UPDATE',
    cycle,
    total_spots: TOTAL_SPOTS,
    total_occupied: totalOccupied,
    total_available: totalAvailable,
    in_transit: isJamActive ? 14 : 4,
    arrival_rate: arrivalRate,
    is_jam_active: isJamActive,
    jammed_corridor: jammedCorridor,
    floors: floorStats,
    corridors: corridors.map((c) => ({
      id: c.id,
      name: c.name,
      is_ramp: c.isRamp,
      capacity: c.capacity,
      vehicles: c.vehicles,
      density: c.density,
      is_jammed: c.isJammed,
    })),
    spots: spots.map((s) => ({
      id: s.id,
      floor: s.floor,
      num: s.num,
      occ: s.occ,
      car: s.car,
      t_in: s.t_in,
      duration: s.parkedDuration,
    })),
    access_ledger: accessLedger,
    timestamp: Date.now(),
  };
}

function broadcastTelemetry() {
  const data = generateTelemetryPayload();
  const serialized = JSON.stringify(data);

  // Formatear como GAMA SimulationOutput y directo
  const gamaWrapped = JSON.stringify({
    type: 'SimulationOutput',
    content: { message: serialized },
  });

  for (const client of clients) {
    sendFrame(client, gamaWrapped);
  }
}

function sendTelemetryToClient(socket) {
  const data = generateTelemetryPayload();
  sendFrame(
    socket,
    JSON.stringify({
      type: 'SimulationOutput',
      content: { message: JSON.stringify(data) },
    })
  );
}

function sendJson(socket, obj) {
  sendFrame(socket, JSON.stringify(obj));
}

function sendFrame(socket, text) {
  if (socket.destroyed || !socket.writable) return;
  const payload = Buffer.from(text, 'utf-8');
  const len = payload.length;

  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  socket.write(Buffer.concat([header, payload]));
}

simulationInterval = setInterval(() => {
  if (isRunning) {
    stepSimulation();
  }
}, 1000);

server.listen(PORT, () => {
  console.log('===============================================================');
  console.log(`[GAMA Parking Mock] Servidor activo en ws://localhost:${PORT}`);
  console.log(`[GAMA Parking Mock] 4 Plantas (A, B, C, D) con 100 plazas c/u (400 total)`);
  console.log('===============================================================');
});

