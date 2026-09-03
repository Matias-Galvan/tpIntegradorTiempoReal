# GAMA Traffic Simulation - Sistemas Distribuidos de Tiempo Real (SDTR)

Modelo de simulación de tráfico multi-agente desarrollado en **GAML (GAMA Modeling Language)** para **GAMA Platform**, diseñado específicamente para integrarse en tiempo real con el panel web React (Vite) vía WebSockets (`ws://localhost:6868`).

---

## 1. Archivos del Modelo

- **`models/RoadTrafficSDTR.gaml`**: Modelo principal de tráfico multi-agente.
  - Basado en el tutorial canónico [RoadTrafficModel (Step 1)](https://gama-platform.org/wiki/RoadTrafficModel_step1).
  - Incluye una red vial sintética autosuficiente (arterias y transversales) con capacidades fijas y desaceleración de agentes por saturación de vía.
  - Curva de generación de demanda variable por hora del día (horas pico 08:00 y 18:00 hs).
  - Mapeo macroscópico de densidad y función `get_telemetry_json`.

---

## 2. Ejecución en GAMA Platform

### Opción A: Interfaz Gráfica (GAMA Desktop)
1. Abre **GAMA Platform**.
2. En el explorador de proyectos, selecciona **Import** > **Existing Models into Workspace** o abre directamente el archivo:
   `gama-traffic-simulation/models/RoadTrafficSDTR.gaml`.
3. En el panel de experimentos, ejecuta:
   - **`TrafficSimulation`**: Inicia la simulación con visualización 2D de calles, vehículos móviles y gráficos de evolución de agentes en tiempo real.
   - Modifica el parámetro `Hora del Día` en el panel de parámetros de GAMA para observar cómo varía la tasa de entrada de vehículos.

### Opción B: GAMA Server (Modo Servidor WebSocket)
1. Para habilitar la escucha en el puerto `6868`:
   - Desde la interfaz de GAMA: Menú superior **Simulation** > **Start GAMA Server**.
   - O vía línea de comandos (Headless):
     ```bash
     gama-headless -socket 6868
     ```
2. El dashboard web en `http://localhost:5173/` se conectará automáticamente.

---

## 3. Pruebas Rápidas sin GAMA Instalado (Mock Server)

Si deseas probar la comunicación bidireccional por WebSocket inmediatamente sin tener que abrir GAMA:

En la terminal, dentro de `web-dashboard`:
```bash
npm run mock-server
```

Esto levantará un servidor WebSocket en `ws://localhost:6868` (implementado en Node.js puro, sin dependencias) que:
1. Recibe los comandos `play`, `pause`, `step` y `set_parameters` desde los botones y slider del dashboard.
2. Emite la telemetría en tiempo real reproduciendo la dinámica macroscópica del modelo GAML.

