/**
 * Servidor WebSocket Mock para GAMA Server (Puerto 6868)
 * Implementación en Node.js puro (CERO DEPENDENCIAS)
 *
 * Simula el comportamiento del motor GAMA y el modelo RoadTrafficSDTR.gaml:
 * - Escucha en ws://localhost:6868
 * - Procesa comandos entrantes: 'play', 'pause', 'step', 'set_parameters' (hora)
 * - Emite ráfagas de telemetría periódicas (aforo, agentes, congestión, tramos)
 * - Permite probar el Dashboard React de extremo a extremo sin tener GAMA abierto
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = 6868;

// Estado de simulación del modelo GAML
let isRunning = false;
let currentHour = 8;
let cycle = 0;
let activeVehicles = 45;
let cumulativeFlow = 120;
let simulationInterval = null;

// Conexiones activas
const clients = new Set();

// Crear servidor HTTP para el handshake WebSocket (RFC 6455)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('GAMA WebSocket Server Mock (SDTR) activo en ws://localhost:' + PORT);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  // Handshake SHA-1 estándar RFC 6455
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
  console.log(`[GAMA Mock Server] Cliente conectado desde ${req.socket.remoteAddress}. Clientes activos: ${clients.size}`);

  // Enviar telemetría inicial
  sendTelemetryToClient(socket);

  // Buffer para tramas entrantes
  socket.on('data', (buffer) => {
    handleWebSocketFrame(socket, buffer);
  });

  socket.on('close', () => {
    clients.delete(socket);
    console.log(`[GAMA Mock Server] Cliente desconectado. Clientes restantes: ${clients.size}`);
  });

  socket.on('error', (err) => {
    console.warn('[GAMA Mock Server] Error en socket:', err.message);
    clients.delete(socket);
  });
});

/**
 * Desempaqueta tramas WebSocket del cliente (máscara XOR según RFC 6455)
 */
function handleWebSocketFrame(socket, buffer) {
  if (buffer.length < 2) return;

  const firstByte = buffer[0];
  const opcode = firstByte & 0x0f;

  // Opcode 8 = Conexión cerrada por cliente
  if (opcode === 0x08) {
    socket.end();
    clients.delete(socket);
    return;
  }

  // Opcode 1 = Texto
  if (opcode === 0x01) {
    const secondByte = buffer[1];
    const isMasked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let offset = 2;

    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      // tramas muy grandes omitidas para simplicidad
      offset = 10;
    }

    let maskingKey = null;
    if (isMasked) {
      maskingKey = buffer.slice(offset, offset + 4);
      offset += 4;
    }

    const payload = buffer.slice(offset, offset + payloadLength);
    if (isMasked && maskingKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskingKey[i % 4];
      }
    }

    const messageText = payload.toString('utf-8');
    processCommand(messageText);
  }
}

/**
 * Procesa los comandos que envía useGamaSimulation
 */
function processCommand(rawMessage) {
  try {
    const cmd = JSON.parse(rawMessage);
    console.log('[GAMA Mock Server] Comando recibido:', cmd);

    const type = cmd.type || cmd.command;

    if (type === 'play') {
      startSimulation();
    } else if (type === 'pause') {
      pauseSimulation();
    } else if (type === 'step') {
      stepSimulation();
    } else if (type === 'set_parameters' || type === 'set_parameter') {
      const h = cmd.value !== undefined ? cmd.value : (cmd.parameters && cmd.parameters[0]?.value);
      if (h !== undefined) {
        currentHour = Number(h);
        console.log(`[GAMA Mock Server] 🕒 Hora actualizada a: ${currentHour}:00 hs`);
        broadcastTelemetry();
      }
    } else if (type === 'ask') {
      try {
        const parsedArgs = typeof cmd.args === 'string' ? JSON.parse(cmd.args) : cmd.args;
        if (parsedArgs && parsedArgs.new_hour !== undefined) {
          currentHour = Number(parsedArgs.new_hour);
          console.log(`[GAMA Mock Server] 🕒 Hora actualizada vía ask a: ${currentHour}:00 hs`);
          broadcastTelemetry();
        }
      } catch (err) {
        console.warn('Error parsing ask args in mock server:', err);
      }
    }
  } catch (e) {
    console.warn('[GAMA Mock Server] Mensaje recibido no es JSON válido:', rawMessage);
  }
}

function startSimulation() {
  if (isRunning) return;
  isRunning = true;
  console.log('[GAMA Mock Server] ▶ Simulación INICIADA');

  if (!simulationInterval) {
    simulationInterval = setInterval(() => {
      if (isRunning) {
        stepSimulation();
      }
    }, 500); // Avanzar ciclo cada 500ms
  }
}

function pauseSimulation() {
  isRunning = false;
  console.log('[GAMA Mock Server] ⏸ Simulación PAUSADA');
  broadcastTelemetry();
}

function stepSimulation() {
  cycle++;

  // Variación dinámica según la hora del día (RoadTrafficSDTR)
  let trafficFactor = 1.0;
  if ((currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19)) {
    // Horas Pico
    trafficFactor = 2.4;
  } else if (currentHour >= 12 && currentHour <= 14) {
    trafficFactor = 1.5;
  } else if (currentHour >= 23 || currentHour <= 5) {
    trafficFactor = 0.3;
  }

  // Variación estocástica de vehículos
  const delta = (Math.random() * 8 - 3.5) * trafficFactor;
  activeVehicles = Math.max(10, Math.min(650, Math.floor(activeVehicles + delta)));
  cumulativeFlow += Math.floor(Math.random() * 3 * trafficFactor);

  broadcastTelemetry();
}

function generateTelemetryPayload() {
  // Calcular densidades para los tramos principales del modelo
  const baseDens = Math.min(100, Math.max(10, Math.floor((activeVehicles / 400) * 80)));
  const roads = [
    { id: 'libertador', name: 'Av. Libertador Norte', density: Math.min(100, baseDens + Math.floor(Math.random() * 15 - 7)) },
    { id: 'autopista', name: 'Autopista Central', density: Math.min(100, Math.floor(baseDens * 1.15) + Math.floor(Math.random() * 10)) },
    { id: 'corrientes', name: 'Av. Corrientes Sur', density: Math.min(100, Math.max(5, baseDens - 12 + Math.floor(Math.random() * 8))) },
    { id: 'transversal_oeste', name: 'Transversal Oeste', density: Math.min(100, Math.max(5, Math.floor(baseDens * 0.7))) },
    { id: 'eje_civico', name: 'Eje Cívico Central', density: Math.min(100, baseDens + Math.floor(Math.random() * 12 - 6)) },
    { id: 'conector_este', name: 'Conector Este', density: Math.min(100, Math.max(5, Math.floor(baseDens * 0.65))) },
  ];

  const avgDens = roads.reduce((acc, r) => acc + r.density, 0) / roads.length;

  let congestionLevel = 'FLUID';
  if (avgDens >= 75) congestionLevel = 'CRITICAL';
  else if (avgDens >= 60) congestionLevel = 'CONGESTED';
  else if (avgDens >= 35) congestionLevel = 'MODERATE';

  const trafficFlow = Math.floor(activeVehicles * (avgDens > 65 ? 1.9 : 3.5) + cumulativeFlow);

  return {
    type: 'TELEMETRY_UPDATE',
    traffic_flow: trafficFlow,
    active_vehicles: activeVehicles,
    current_hour: currentHour,
    congestion_level: congestionLevel,
    road_densities: roads,
    cycle: cycle,
    timestamp: Date.now(),
  };
}

function broadcastTelemetry() {
  const payload = JSON.stringify(generateTelemetryPayload());
  for (const client of clients) {
    sendRawFrame(client, payload);
  }
}

function sendTelemetryToClient(socket) {
  const payload = JSON.stringify(generateTelemetryPayload());
  sendRawFrame(socket, payload);
}

/**
 * Empaqueta un string en una trama WebSocket de servidor sin enmascarar (RFC 6455)
 */
function sendRawFrame(socket, text) {
  try {
    const payload = Buffer.from(text, 'utf-8');
    const length = payload.length;

    let header;
    if (length <= 125) {
      header = Buffer.from([0x81, length]);
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    socket.write(Buffer.concat([header, payload]));
  } catch (err) {
    clients.delete(socket);
  }
}

server.listen(PORT, () => {
  console.log('================================================================');
  console.log(` 🚗 GAMA Server Mock (SDTR) escuchando en: ws://localhost:${PORT}`);
  console.log(' Conecta tu React Dashboard para controlar la simulación.');
  console.log(' Presiona Ctrl+C para detener.');
  console.log('================================================================');
});

