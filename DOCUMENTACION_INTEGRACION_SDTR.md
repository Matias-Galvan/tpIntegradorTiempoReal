# Documentación Técnica: Sistema Distribuido de Tiempo Real (SDTR)
## Control y Telemetría de Simulación de Tráfico Multi-Agente (GAMA Platform + React Vite)

**Materia:** Programación en Tiempo Real  
**Proyecto:** Trabajo Integrador  
**Fecha:** Septiembre 2026  

---

## 1. Resumen Ejecutivo

El presente proyecto implementa una arquitectura distribuida de tiempo real para el monitoreo, control y visualización de un sistema de tráfico vehicular multi-agente. La plataforma de simulación **GAMA Platform** corre en modo servidor desatendido (*Headless WebSocket Server*) en el puerto `6868`, mientras que el operador interactúa a través de una aplicación web reactiva desarrollada con **React 18** y **Vite**.

El sistema permite:
1. **Control bidireccional no bloqueante**: Iniciar, pausar, avanzar paso a paso y mutar la hora simulada (00:00 a 23:00 hs) en caliente.
2. **Streaming de telemetría a baja latencia**: Ingesta continua de métricas macroscópicas (aforo, agentes activos, nivel de congestión global y saturación tramo a tramo).
3. **Visualización geoespacial interactiva**: Renderizado vectorial (SVG) de la red vial urbana a 60 FPS con semaforización cromática en tiempo real y micro-inspección mediante HUD flotante.

---

## 2. Arquitectura General del Sistema

```text
+-------------------------------------------------------------------------+
|                         CAPA DE APLICACIÓN WEB                          |
|                                                                         |
|  [SimulationControls] <--(User Input)-- [Slider 0-23hs (Rate Limiter)]  |
|            |                                                            |
|  [DashboardView] <---- [useGamaSimulation Hook] <---+                   |
|            |                                        | (Observer Pattern)|
|      [TrafficMap] (SVG 60 FPS + HUD)                |                   |
|                                                     |                   |
|                   [GamaSocketService (Singleton)] <-+                   |
+-----------------------------------|-------------------------------------+
                                    |
                    Canal WebSocket (ws://localhost:6868)
              RFC 6455 / JSON Framing / Backoff Exponencial
                                    |
+-----------------------------------|-------------------------------------+
|                     MOTOR DE TIEMPO REAL (GAMA)                         |
|                                                                         |
|   GAMA Headless WebSocket Server (Puerto 6868)                          |
|   Experimento: HeadlessServer (100% computación en memoria)             |
|                                                                         |
|   +-----------------------------------------------------------------+   |
|   |                  Modelo: RoadTrafficSDTR.gaml                   |   |
|   |                                                                 |   |
|   |  * Grafo Vial: 6 arterias (1200m x 1200m) + 9 intersecciones    |   |
|   |  * Agentes 'vehicle': Skill 'moving' con velocidad adaptativa   |   |
|   |  * Inyección Horaria: Curva de demanda (Picos 08:00 / 18:00 hs) |   |
|   |  * Reflex 'traffic_drain': Drenaje de embotellamiento reactivo   |   |
|   |  * Acción 'set_sim_hour': Mutación en caliente vía 'ask'        |   |
|   |  * Función 'get_telemetry_json': Streaming push de telemetría   |   |
|   +-----------------------------------------------------------------+   |
+-------------------------------------------------------------------------+
```

---

## 3. Capa de Comunicación y Red (`src/services/gamaSocket.js`)

### 3.1. Patrón Singleton & Observer
- **Singleton**: Garantiza una única instancia del cliente WebSocket en toda la aplicación, evitando conexiones redundantes o duplicación de hilos de red.
- **Observer (`subscribe` / `unsubscribe`)**: Permite que cualquier componente React se suscriba al flujo de telemetría y a los cambios de estado de red (`CONNECTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`).

### 3.2. Resiliencia: Backoff Exponencial con Jitter
Para tolerar caídas temporales o reinicios de GAMA Server sin saturar el canal (*thundering herd problem*), la reconexión aplica:
$$\text{delay} = \min\left(\text{baseDelay} \times \text{factor}^{(\text{intentos}-1)},\, \text{maxDelay}\right) \pm \text{jitter}$$
- $\text{baseDelay} = 1000\text{ ms}$
- $\text{factor} = 1.6$
- $\text{maxDelay} = 15000\text{ ms}$
- $\text{jitter} \in [-500, +500]\text{ ms}$

### 3.3. Protocolo GAMA Server 2025 Headless
El servidor de GAMA opera bajo una máquina de estados estricta descubierta y adaptada durante la integración:

1. **Handshake en Dos Fases (`load` $\rightarrow$ `play`)**:
   - Al encenderse, GAMA Server no contiene ninguna simulación activa en memoria.
   - El cliente envía la orden de compilación:
     ```json
     {
       "type": "load",
       "model": ".../RoadTrafficSDTR.gaml",
       "experiment": "HeadlessServer"
     }
     ```
   - GAMA Server responde con `CommandExecutedSuccessfully` asignando un identificador dinámico: `content: "<exp_id>"`.
   - El cliente captura dicho identificador y dispara la orden de ejecución:
     ```json
     { "type": "play", "exp_id": "<exp_id>" }
     ```

2. **Invocación Remota de Acciones vía `ask`**:
   - Para mutar variables de simulación en caliente (como la hora actual), GAMA Server requiere invocar acciones sobre el macro-agente `simulation[0]` pasando los argumentos como string JSON:
     ```json
     {
       "type": "ask",
       "exp_id": "<exp_id>",
       "agent": "simulation[0]",
       "action": "set_sim_hour",
       "args": "{\"new_hour\": 14}"
     }
     ```

---

## 4. Capa de Reactividad en el Frontend

### 4.1. Custom Hook (`src/hooks/useGamaSimulation.js`)
Centraliza el estado reactivo con garantías de inmutabilidad y limpieza estricta en React 18:
- `isConnected` / `connectionState`: Estado de red para gobernanza de la UI.
- `simulationData`: Contiene aforo, vehículos activos, hora simulada, nivel de congestión, densidades tramo a tramo y número de ciclo.
- `play()`, `pause()`, `step()`, `setHour()`: Funciones memoizadas con `useCallback`.

### 4.2. Limitador de Tasa en el Slider Horario (`SimulationControls.jsx`)
Para evitar saturar la cola de comandos del servidor al arrastrar el control deslizante:
- **Doble Estado Reactivo**: El valor visual del slider responde inmediatamente a 60 FPS.
- **Throttling + Trailing Debounce (120 ms)**: La emisión del comando `ask` por WebSocket se acota temporalmente.
- **Protección contra Eco de Red (`isDraggingRef`)**: Mientras el usuario mantiene pulsado el ratón, los paquetes de telemetría entrantes no pueden sobreescribir la posición del control.

---

## 5. Visualización Vectorial Espacial (`src/components/TrafficMap.jsx`)

Mapea fielmente las coordenadas del modelo ($1200\text{m} \times 1200\text{m}$) mediante SVG interactivo:

| Arteria | Orientación | Coordenadas $(X_1, Y_1) \rightarrow (X_2, Y_2)$ | Capacidad |
| :--- | :--- | :--- | :--- |
| **Av. Libertador Norte** | Horizontal | $(100, 300) \rightarrow (1100, 300)$ | 40 veh |
| **Autopista Central** | Horizontal | $(100, 600) \rightarrow (1100, 600)$ | 70 veh |
| **Av. Corrientes Sur** | Horizontal | $(100, 900) \rightarrow (1100, 900)$ | 40 veh |
| **Transversal Oeste** | Vertical | $(300, 100) \rightarrow (300, 1100)$ | 30 veh |
| **Eje Cívico Central** | Vertical | $(600, 100) \rightarrow (600, 1100)$ | 35 veh |
| **Conector Este** | Vertical | $(900, 100) \rightarrow (900, 1100)$ | 30 veh |

### Semáforo Cromático de Densidad:
- 🟢 **Fluido (<35%)**: Traza verde esmeralda (`#10b981`).
- 🟡 **Moderado (35% - 60%)**: Traza ámbar (`#eab308`).
- 🟠 **Congestionado (60% - 80%)**: Traza naranja (`#f97316`).
- 🔴 **Crítico (>80%)**: Traza carmesí (`#ef4444`) con animación de resplandor pulsante (*glow pulse*).
- **Vehículos Dinámicos**: Partículas representadas como puntos de luz sincronizados según la densidad de cada vía.
- **HUD Flotante**: Al posicionar el cursor sobre cualquier vía, se muestra nombre, porcentaje de saturación, vehículos actuales, capacidad máxima y velocidad de diseño.

---

## 6. Modelo Multi-Agente en GAML (`RoadTrafficSDTR.gaml`)

### 6.1. Experimento `HeadlessServer`
Diseñado específicamente para prescindir de la capa gráfica de Eclipse/SWT:
- No genera superficies virtuales de pantalla (*Image Display Surface*).
- Aumenta la velocidad de cálculo en un orden de magnitud y elimina el consumo superfluo de RAM/GPU.

### 6.2. Reflejo de Drenaje Dinámico (`traffic_drain`)
Resuelve el problema de saturación residual cuando el operador reduce la demanda (por ejemplo, cambiando de 18:00 hs pico a 23:00 hs nocturno):
```gaml
reflex traffic_drain {
    if (length(vehicle) > max_capacity_hour) {
        int excess <- length(vehicle) - max_capacity_hour;
        int to_drain <- min([excess, int(max([1, excess * 0.15]))]);
        ask (to_drain among vehicle) {
            cumulative_flow <- cumulative_flow + 1;
            do die;
        }
    }
}
```
Esto permite que la descongestión de la ciudad se aprecie de forma inmediata en el dashboard en un lapso de 2 a 3 segundos.

---

## 7. Guía de Ejecución del Proyecto

### Opción A: Ejecución con GAMA Platform Headless (Nativo)

1. **Iniciar GAMA Server**:
   Ejecutar desde la raíz del proyecto:
   ```cmd
   start-gama-headless.bat
   ```
   *(O alternativamente: `npm run gama-server` desde `web-dashboard`)*.
   El servidor quedará a la espera en `ws://localhost:6868`.

2. **Iniciar el Dashboard Web**:
   ```cmd
   cd web-dashboard
   npm run dev
   ```
   Abrir el navegador en `http://localhost:5173`.

3. **Operación**:
   - Presionar **▶ Iniciar**.
   - Mover el control de horario para inducir olas de tráfico diurnas o nocturnas.

---

### Opción B: Ejecución con Servidor Mock (Entorno Aislado)

Para pruebas de desarrollo sin necesidad de abrir GAMA Platform:
```cmd
cd web-dashboard
npm run mock-server
```
Y en otra terminal:
```cmd
npm run dev
```

---

## 8. Verificación y Resultados Obtenidos

| Criterio | Prueba Realizada | Resultado |
| :--- | :--- | :--- |
| **Integridad del Código** | `npm run lint` (ESLint 9) | ✅ 0 errores, 0 warnings |
| **Compilación Frontend** | `npm run build` (Vite) | ✅ Bundle de producción generado en ~115ms |
| **Conexión WebSocket** | Apertura, intercambio de tramas y reconexión | ✅ Handshake bidireccional fluido en puerto 6868 |
| **Mutación en Caliente** | Despacho de comando `ask` hacia `simulation[0]` | ✅ Hora actualizada y confirmada en consola GAML |
| **Drenaje de Tráfico** | Transición horaria de 18:00 hs a 23:00 hs | ✅ Reducción de 450 a 50 agentes; congestión de Crítico a Fluido |
| **Mapa Interactivo** | Renderizado SVG con semáforo cromático y HUD | ✅ 60 FPS constantes con micro-inspección de arterias |

---

## 9. Subsistema de Estacionamiento Inteligente Multi-Planta

El proyecto incorpora un segundo subsistema integral diseñado bajo los mismos principios de tiempo real:

### 9.1. Especificaciones Físicas
- **4 Plantas (A, B, C, D)** con 100 plazas de aparcamiento por planta ($4 \times 100 = 400$ plazas totales).
- **Nomenclatura**: Normalizada en formato `[Piso]-[Nro]`, ej: `A-1` a `A-100`, `B-1` a `B-100`, `C-1` a `C-100` y `D-1` a `D-100`.
- **Sensores Binarios**: Cada plaza cuenta con un sensor digital visual (`🟢 DISPONIBLE` / `🔴 OCUPADO`).

### 9.2. Cartelería Digital de Aforo con Flechas LED (`ParkingSignage.jsx`)
- **Cartel General (Tótem Central)**: Balance de las 400 plazas del edificio.
- **Carteles por Planta (Plantas A, B, C, D)**:
  - ⬅️ **Flecha Roja**: Cantidad exacta de lugares ocupados.
  - ➡️ **Flecha Verde**: Cantidad exacta de lugares disponibles.
  - Barra de llenado porcentual con tags `ABIERTO`, `CASI LLENO` y `COMPLETO`.

### 9.3. Control de Accesos y Registro Temporal Exacto (`AccessLedger.jsx`)
- Al ingresar por la barrera principal, el sistema almacena la hora exacta $T_{in}$ (formato `HH:MM:SS`) y asigna la plaza.
- Al salir, registra $T_{out}$, calcula la estadía total transcurrida y libera el sensor de la plaza.

### 9.4. Tráfico Interno y Detección de Atascamientos (`InternalTrafficMonitor.jsx`)
- Monitoreo continuo de velocidad y densidad en rampas de interconexión (`Rampa A -> B`, `Rampa B -> C`, `Rampa C -> D`) y pasillos centrales.
- **Detección Automática de Cuellos de Botella (Jam Detection)** cuando la densidad supera el 75% o los vehículos se detienen por tiempo prolongado, activando alarmas visuales inmediatas.

### 9.5. Plano Arquitectónico 2D Interactivo (`ParkingFloorPlan.jsx`)
- **Modo Dual**: Alternador entre `🗺️ Plano 2D` (arquitectura vial) y `🔢 Grilla 100` (matriz de sensores).
- **Diseño Vial**:
  - Rampa de entrada con demarcación vial y flecha direccional verde.
  - Rampa de egreso/interconexión inter-planta con señalización de atascamiento.
  - 4 bahías de 25 plazas c/u con avenida central y carriles de maniobra norte y sur.
  - Sensores cenitales LED (verde/rojo) y siluetas vectoriales de autos con patente legible.
  - Selector interactivo con modal para inspección de patente, hora $T_{in}$ y piso.

### 9.6. Dimensión SDTR y Algoritmos de Concurrencia

El estacionamiento implementa tres pilares fundamentales de Sistemas Distribuidos de Tiempo Real:

1. **Control de Concurrencia en Rampas (Semáforos Mutex - `RampMutexIndicator.jsx`)**:
   - Resuelve el problema de exclusión mutua en rampas de un solo carril alternado.
   - Máquina de estados: `UP` (ascenso), `CLEARING` (vaciado preventivo de seguridad de 3s) y `DOWN` (descenso).
   - Colas de espera balanceadas para evitar inanición (*Starvation-Free*) y prevención de interbloqueos (*Deadlock Prevention*).

2. **Algoritmo de Despacho Predictivo Inteligente (Smart Dispatching)**:
   - Evalúa en el momento del ingreso una función de costo $J(P, F)$ en tiempo real:
     $$J(P, F) = 0.40 \cdot \text{DistanciaVertical} + 0.35 \cdot \text{CongestiónRampas} + 0.25 \cdot \text{DistanciaPasillo}$$
   - Asigna la plaza óptima global calculando la ruta de navegación y el tiempo estimado de llegada (*ETA* en segundos).
   - Enfoca automáticamente la planta correspondiente en el plano arquitectónico.

3. **Protocolo Crítico de Evacuación de Emergencia con Medición de WCET (`EmergencyEvacuationPanel.jsx`)**:
   - Conmuta el sistema al modo de seguridad crítica (*Hard Real-Time Safety*).
   - Todas las rampas pasan a descenso exclusivo (`OVERRIDE_DOWN`) y las barreras se abren.
   - Mide el tiempo de peor caso de evacuación (*Worst-Case Evacuation Time - WCET*) frente al *Deadline* crítico reglamentario ($T_{crit} = 180\text{ s}$).

### 9.7. Ejecución del Módulo de Estacionamiento

**Opción GAMA Server (Producción / Simulación Oficial):**
```cmd
cd web-dashboard
npm run gama-server
```
Y en otra terminal:
```cmd
npm run dev
```

**Opción Mock Server (Desarrollo rápido):**
```cmd
cd web-dashboard
npm run mock-parking
```
Y en otra terminal:
```cmd
npm run dev
```
Luego seleccionar la pestaña **"🅿️ Estacionamiento 4 Plantas"** en la cabecera superior.




