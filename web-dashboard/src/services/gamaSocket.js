/**
 * GAMA WebSocket Service
 * Cliente WebSocket Singleton con soporte bidireccional para GAMA Platform / GAMA Server (Puerto 6868).
 *
 * Optimizaciones para Sistemas Distribuidos de Tiempo Real (SDTR):
 * - Usa el experimento 'HeadlessServer' para evitar la creación innecesaria de superficies gráficas ('Image Display Surface') en el servidor.
 * - Flag `isLoading` para evitar despachos múltiples de 'load' al presionar Play.
 * - Desempaquetado dual de telemetría: Procesa tanto payloads JSON directos como strings de consola emitidos por GAMA.
 * - Manejo reactivo de `exp_id` para garantizar que la orden 'play' se ejecute con el identificador correcto.
 */

export const ConnectionState = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DISCONNECTED: 'DISCONNECTED',
};

class GamaSocketService {
  constructor() {
    if (GamaSocketService.instance) {
      return GamaSocketService.instance;
    }

    this.url = import.meta.env.VITE_GAMA_WS_URL || 'ws://localhost:6868';
    
    // Identificar módulo activo guardado (por defecto PARKING para esta entrega)
    const savedTab = typeof localStorage !== 'undefined' ? (localStorage.getItem('sdtr_active_tab') || 'PARKING') : 'PARKING';
    this.activeModule = savedTab;

    if (this.activeModule === 'PARKING') {
      this.modelPath = 'C:/Users/matia/Desktop/Facultad/Programacion en tiempo real/Trabajo integrador/tpIntegradorTiempoReal/gama-traffic-simulation/models/SmartParkingSDTR.gaml';
      this.experimentName = 'HeadlessParkingServer';
    } else {
      this.modelPath = 'C:/Users/matia/Desktop/Facultad/Programacion en tiempo real/Trabajo integrador/tpIntegradorTiempoReal/gama-traffic-simulation/models/RoadTrafficSDTR.gaml';
      this.experimentName = 'HeadlessServer';
    }

    this.socket = null;
    this.connectionState = ConnectionState.DISCONNECTED;
    this.subscribers = new Set();

    this.expId = null;
    this.isModelLoaded = false;
    this.isLoading = false;
    this.pendingPlay = false;

    // Parámetros de reconexión exponencial con jitter
    this.reconnectAttempts = 0;
    this.baseDelay = 1000;
    this.maxDelay = 15000;
    this.backoffFactor = 1.6;
    this.jitterRange = 500;
    this.reconnectTimer = null;
    this.isExplicitlyClosed = false;

    GamaSocketService.instance = this;
  }

  static getInstance() {
    if (!GamaSocketService.instance) {
      GamaSocketService.instance = new GamaSocketService();
    }
    return GamaSocketService.instance;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this._setConnectionState(
      this.reconnectAttempts > 0 ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING
    );

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = this._handleOpen.bind(this);
      this.socket.onmessage = this._handleMessage.bind(this);
      this.socket.onerror = this._handleError.bind(this);
      this.socket.onclose = this._handleClose.bind(this);
    } catch (error) {
      console.error('[GamaSocket] Error instanciando WebSocket:', error);
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this.isExplicitlyClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;

      if (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close(1000, 'Cliente desconectado');
      }
      this.socket = null;
    }

    this.reconnectAttempts = 0;
    this.expId = null;
    this.isModelLoaded = false;
    this.isLoading = false;
    this.pendingPlay = false;
    this._setConnectionState(ConnectionState.DISCONNECTED);
  }

  /**
   * Envía un comando no bloqueante hacia GAMA Platform
   */
  sendCommand(commandObj) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[GamaSocket] No conectado. Comando descartado:', commandObj);
      return false;
    }

    try {
      const payload = { ...commandObj };
      if (this.expId && !payload.exp_id && payload.type !== 'load') {
        payload.exp_id = String(this.expId);
      }

      const serialized = JSON.stringify(payload);
      this.socket.send(serialized);
      return true;
    } catch (err) {
      console.error('[GamaSocket] Error enviando comando:', err, commandObj);
      return false;
    }
  }

  /**
   * Conmuta el módulo activo (TRAFFIC o PARKING) y carga el modelo correspondiente si es necesario
   */
  setActiveModule(moduleName) {
    const isTraffic = moduleName === 'TRAFFIC';
    const targetModel = isTraffic
      ? 'C:/Users/matia/Desktop/Facultad/Programacion en tiempo real/Trabajo integrador/tpIntegradorTiempoReal/gama-traffic-simulation/models/RoadTrafficSDTR.gaml'
      : 'C:/Users/matia/Desktop/Facultad/Programacion en tiempo real/Trabajo integrador/tpIntegradorTiempoReal/gama-traffic-simulation/models/SmartParkingSDTR.gaml';
    const targetExperiment = isTraffic ? 'HeadlessServer' : 'HeadlessParkingServer';

    this.activeModule = moduleName;

    // Si ya estamos cargando o tenemos cargado ese mismo experimento, no recargar
    if (this.modelPath === targetModel && this.experimentName === targetExperiment && (this.expId || this.isLoading)) {
      console.info(`[GamaSocket] Módulo ${moduleName} ya activo o en carga.`);
      return;
    }

    console.info(`[GamaSocket] 🔄 Conmutando a módulo: ${moduleName} (${targetExperiment})`);
    this.loadModel(targetModel, targetExperiment);
  }

  /**
   * Inicia o reanuda la simulación en GAMA Server.
   * Si el modelo aún no fue cargado, solicita la carga y programa el play automático.
   */
  play() {
    if (!this.expId || !this.isModelLoaded) {
      console.info(`[GamaSocket] Modelo ${this.experimentName} no listo (exp_id=${this.expId}). Cargando y programando Play...`);
      this.pendingPlay = true;
      this.loadModel();
      return false;
    }

    console.info(`[GamaSocket] ▶ Enviando orden Play a GAMA Server (exp_id: ${this.expId})`);
    return this.sendCommand({
      type: 'play',
      exp_id: String(this.expId),
      command: 'play',
    });
  }

  /**
   * Pausa la simulación en GAMA Server
   */
  pause() {
    console.info(`[GamaSocket] ⏸ Enviando orden Pausa a GAMA Server (exp_id: ${this.expId})`);
    return this.sendCommand({
      type: 'pause',
      exp_id: String(this.expId || '0'),
      command: 'pause',
    });
  }

  /**
   * Avanza un ciclo en la simulación
   */
  step() {
    return this.sendCommand({
      type: 'step',
      exp_id: String(this.expId || '0'),
      nb_step: 1,
      command: 'step',
    });
  }

  /**
   * Solicita a GAMA Server compilar y cargar el modelo en memoria
   */
  loadModel(modelPath = this.modelPath, experimentName = this.experimentName) {
    if (this.isLoading && this.modelPath === modelPath && this.experimentName === experimentName) {
      console.info(`[GamaSocket] Carga de ${experimentName} ya en curso...`);
      return false;
    }

    this.modelPath = modelPath;
    this.experimentName = experimentName;
    this.expId = null;
    this.isModelLoaded = false;
    this.isLoading = true;

    console.info(`[GamaSocket] Solicitando carga de modelo: ${experimentName}`);
    return this.sendCommand({
      type: 'load',
      model: modelPath,
      experiment: experimentName,
    });
  }

  setSimulationHour(hour) {
    const validHour = Math.min(23, Math.max(0, Number(hour)));

    // 1. Comando oficial 'ask' de GAMA Server para ejecutar acciones sobre el agente simulation[0]
    if (this.expId) {
      this.sendCommand({
        type: 'ask',
        exp_id: String(this.expId),
        agent: 'simulation[0]',
        action: 'set_sim_hour',
        args: JSON.stringify({ new_hour: validHour }),
      });
    }

    // 2. Compatibilidad con Mock Server
    return this.sendCommand({
      type: 'set_parameters',
      parameter: 'current_hour',
      value: validHour,
      parameters: [{ name: 'current_hour', value: validHour }],
    });
  }

  /**
   * Configura la tasa de arribo para el estacionamiento inteligente
   */
  setParkingArrivalRate(rate) {
    if (this.expId) {
      this.sendCommand({
        type: 'ask',
        exp_id: String(this.expId),
        agent: 'simulation[0]',
        action: 'set_arrival_rate_cmd',
        args: JSON.stringify({ new_rate: rate }),
      });
    }
  }

  /**
   * Induce un atascamiento en pasillo o rampa
   */
  triggerParkingJam(corridor = 'RAMP_A_B') {
    if (this.expId) {
      this.sendCommand({
        type: 'ask',
        exp_id: String(this.expId),
        agent: 'simulation[0]',
        action: 'trigger_jam_cmd',
        args: JSON.stringify({ corridor_target: corridor }),
      });
    }
  }

  /**
   * Despeja cualquier atascamiento activo
   */
  clearParkingJam() {
    if (this.expId) {
      this.sendCommand({
        type: 'ask',
        exp_id: String(this.expId),
        agent: 'simulation[0]',
        action: 'clear_jam_cmd',
        args: '{}',
      });
    }
  }

  /**
   * Dispara el ingreso manual de un vehículo en la barrera principal
   */
  spawnManualVehicle() {
    if (this.expId) {
      this.sendCommand({
        type: 'ask',
        exp_id: String(this.expId),
        agent: 'simulation[0]',
        action: 'spawn_manual_vehicle',
        args: '{}',
      });
    }
  }

  subscribe(callback) {
    if (typeof callback !== 'function') {
      throw new Error('[GamaSocket] Callback debe ser función.');
    }

    this.subscribers.add(callback);

    callback({
      type: 'CONNECTION_STATUS',
      isConnected: this.connectionState === ConnectionState.CONNECTED,
      state: this.connectionState,
    });

    if (this.subscribers.size === 1 && this.connectionState === ConnectionState.DISCONNECTED) {
      this.connect();
    }

    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback) {
    this.subscribers.delete(callback);
  }

  getConnectionState() {
    return this.connectionState;
  }

  isConnected() {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  // ==========================================
  // Manejadores y Ciclo de Vida
  // ==========================================

  _handleOpen() {
    console.info(`[GamaSocket] Conectado exitosamente con ws://localhost:6868`);
    this.reconnectAttempts = 0;
    this._setConnectionState(ConnectionState.CONNECTED);

    // Cargar modelo inicial en el servidor
    setTimeout(() => {
      this.loadModel();
    }, 150);
  }

  _handleMessage(event) {
    if (!event || !event.data) return;

    try {
      let rawData = event.data;
      let parsed = null;

      if (typeof rawData === 'string') {
        try {
          parsed = JSON.parse(rawData);
        } catch {
          parsed = { type: 'RAW_TEXT', data: rawData };
        }
      } else {
        parsed = rawData;
      }

      if (!parsed || typeof parsed !== 'object') return;

      // Capturar exp_id asignado si viene en la cabecera
      if (parsed.exp_id && !this.expId) {
        this.expId = String(parsed.exp_id);
      }

      // Respuesta al comando 'load'
      if (parsed.type === 'CommandExecutedSuccessfully' && (parsed.command?.type === 'load' || this.isLoading)) {
        this.expId = String(parsed.content);
        this.isModelLoaded = true;
        this.isLoading = false;
        console.info(`[GamaSocket] ✓ Modelo RoadTrafficSDTR cargado en GAMA Server. exp_id = ${this.expId}`);

        if (this.pendingPlay) {
          this.pendingPlay = false;
          this.play();
        }
      }

      // Normalizar telemetría entrante
      const normalizedData = this._normalizeTelemetry(parsed);
      if (normalizedData) {
        this._notifySubscribers(normalizedData);
      }
    } catch (err) {
      console.error('[GamaSocket] Error procesando mensaje:', err);
    }
  }

  _handleError(event) {
    console.warn('[GamaSocket] Evento de error WebSocket:', event);
  }

  _handleClose(event) {
    console.warn(`[GamaSocket] Conexión cerrada (${event.code})`);
    this.socket = null;
    this.isModelLoaded = false;
    this.isLoading = false;
    this.expId = null;

    if (!this.isExplicitlyClosed) {
      this._scheduleReconnect();
    } else {
      this._setConnectionState(ConnectionState.DISCONNECTED);
    }
  }

  _scheduleReconnect() {
    this._setConnectionState(ConnectionState.RECONNECTING);

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts += 1;
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(this.backoffFactor, this.reconnectAttempts - 1),
      this.maxDelay
    );
    const jitter = (Math.random() * 2 - 1) * this.jitterRange;
    const finalDelay = Math.max(500, Math.floor(exponentialDelay + jitter));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, finalDelay);
  }

  _setConnectionState(newState) {
    if (this.connectionState === newState) return;
    this.connectionState = newState;

    this._notifySubscribers({
      type: 'CONNECTION_STATUS',
      isConnected: newState === ConnectionState.CONNECTED,
      state: newState,
      reconnectAttempts: this.reconnectAttempts,
    });
  }

  _notifySubscribers(payload) {
    for (const callback of this.subscribers) {
      try {
        callback(payload);
      } catch (err) {
        console.error('[GamaSocket] Error en callback de suscriptor:', err);
      }
    }
  }

  /**
   * Normaliza la telemetría recibida desde GAMA Server o el Mock Server
   */
  _normalizeTelemetry(raw) {
    if (!raw || typeof raw !== 'object') return null;

    let payload = raw;

    // Caso 1: GAMA Server emite mensaje en SimulationOutput
    if (raw.type === 'SimulationOutput' && raw.content && typeof raw.content.message === 'string') {
      const msg = raw.content.message.trim();

      // Subcaso 1A: Cadena JSON de telemetría completa
      if (msg.includes('TELEMETRY_UPDATE')) {
        try {
          const jsonStart = msg.indexOf('{');
          const jsonEnd = msg.lastIndexOf('}');
          if (jsonStart !== -1 && jsonEnd !== -1) {
            payload = JSON.parse(msg.substring(jsonStart, jsonEnd + 1));
          }
        } catch {
          // continuar con fallback
        }
      } else if (msg.includes('TELEMETRY #')) {
        // Subcaso 1B: Cadena textual de consola GAML
        const match = msg.match(/\[TELEMETRY #(\d+)\]\s+H:(\d+)hs\s+\|\s+Veh[íi]culos:(\d+)\s+\|\s+Congesti[óo]n:([A-Z]+)\s+\((\d+)%\)/i);
        if (match) {
          const cycleNum = parseInt(match[1], 10);
          const hourNum = parseInt(match[2], 10);
          const vehNum = parseInt(match[3], 10);
          const congStr = match[4].toUpperCase();
          const densNum = parseInt(match[5], 10);

          payload = {
            type: 'TELEMETRY_UPDATE',
            traffic_flow: Math.floor(vehNum * (densNum > 70 ? 2.1 : 3.5)),
            active_vehicles: vehNum,
            current_hour: hourNum,
            congestion_level: congStr,
            road_densities: [
              { id: 'libertador', name: 'Av. Libertador Norte', density: Math.min(100, densNum + 5) },
              { id: 'autopista', name: 'Autopista Central', density: Math.min(100, Math.floor(densNum * 1.1)) },
              { id: 'corrientes', name: 'Av. Corrientes Sur', density: Math.min(100, Math.max(0, densNum - 8)) },
              { id: 'transversal_oeste', name: 'Transversal Oeste', density: Math.min(100, Math.max(0, Math.floor(densNum * 0.75))) },
              { id: 'eje_civico', name: 'Eje Cívico Central', density: Math.min(100, densNum) },
              { id: 'conector_este', name: 'Conector Este', density: Math.min(100, Math.max(0, Math.floor(densNum * 0.7))) },
            ],
            cycle: cycleNum,
            timestamp: Date.now(),
          };
        } else {
          return null;
        }
      } else {
        return null;
      }
    } else if (raw.content && typeof raw.content === 'object') {
      payload = { ...raw.content, _rawType: raw.type };
    }

    // Soporte para Telemetría de Estacionamiento Inteligente
    if (payload.type === 'PARKING_TELEMETRY_UPDATE') {
      return {
        type: 'PARKING_TELEMETRY_UPDATE',
        cycle: payload.cycle,
        totalSpots: payload.total_spots ?? 400,
        totalOccupied: payload.total_occupied ?? 0,
        totalAvailable: payload.total_available ?? (400 - (payload.total_occupied ?? 0)),
        inTransit: payload.in_transit ?? 0,
        arrivalRate: payload.arrival_rate ?? 0.5,
        isJamActive: payload.is_jam_active ?? false,
        jammedCorridor: payload.jammed_corridor ?? '',
        floors: payload.floors ?? [],
        corridors: payload.corridors ?? [],
        spots: payload.spots ?? [],
        accessLedger: payload.access_ledger ?? [],
        timestamp: payload.timestamp || Date.now(),
        raw: payload,
      };
    }

    // Detectar si el paquete contiene campos válidos de telemetría de tráfico urbano
    const hasFlow = payload.traffic_flow !== undefined || payload.trafficFlow !== undefined || payload.aforo !== undefined;
    const hasVehicles = payload.active_vehicles !== undefined || payload.activeVehicles !== undefined || payload.vehiculos_activos !== undefined;
    const hasHour = payload.current_hour !== undefined || payload.currentHour !== undefined || payload.hora !== undefined;
    const hasCongestion = payload.congestion_level !== undefined || payload.congestionLevel !== undefined || payload.congestion !== undefined;
    const hasRoads = payload.road_densities !== undefined || payload.roadDensities !== undefined || payload.densidad_tramos !== undefined;

    if (!hasFlow && !hasVehicles && !hasHour && !hasCongestion && !hasRoads) {
      return null;
    }

    return {
      type: payload.type || 'TELEMETRY_UPDATE',
      trafficFlow: hasFlow ? (payload.traffic_flow ?? payload.trafficFlow ?? payload.aforo) : undefined,
      activeVehicles: hasVehicles ? (payload.active_vehicles ?? payload.activeVehicles ?? payload.vehiculos_activos) : undefined,
      currentHour: hasHour ? (payload.current_hour ?? payload.currentHour ?? payload.hora) : undefined,
      congestionLevel: hasCongestion ? (payload.congestion_level ?? payload.congestionLevel ?? payload.congestion) : undefined,
      roadDensities: hasRoads ? (payload.road_densities ?? payload.roadDensities ?? payload.densidad_tramos) : undefined,
      cycle: payload.cycle ?? payload.step,
      timestamp: Date.now(),
      raw: payload,
    };
  }
}

export const gamaSocket = GamaSocketService.getInstance();
export default gamaSocket;
