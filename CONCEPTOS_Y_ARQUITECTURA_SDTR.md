# Arquitectura y Fundamentos de Programación en Tiempo Real (SDTR)
## Trabajo Integrador: Sistema Distribuido de Estacionamiento Inteligente Multi-Planta y Tráfico Urbano

---

## 1. Visión General de la Arquitectura Distribuida

El sistema implementa una arquitectura cliente-servidor distribuida desacoplada para la supervisión y control en tiempo real de dos subsistemas de movilidad urbana:
1. **Red de Tráfico Urbano Central**: Modelado de macro y micro-flujo de arterias principales y semaforización.
2. **Estacionamiento Inteligente Multi-Planta (4 Plantas, 400 Plazas)**: Asignación predictiva, control de exclusión mutua en rampas, cobro automatizado y protocolo de evacuación crítica (WCET).

```mermaid
flowchart TD
    subgraph KERNEL ["Núcleo de Simulación (GAMA Platform / Headless Server)"]
        direction TB
        GAMA_WORLD["GAMA World (BDI & Agent-Based Modeling)"]
        AGENTS_CAR["Agentes Vehículo (parking_vehicle)"]
        AGENTS_SPOT["Agentes Plazas (parking_spot)"]
        MUTEX_RAMPS["Controlador de Concurrencia (Ramp Mutex)"]
        DISPATCHER["Motor de Despacho Predictivo (Smart Dispatcher)"]
        
        GAMA_WORLD --> AGENTS_CAR
        GAMA_WORLD --> AGENTS_SPOT
        GAMA_WORLD --> MUTEX_RAMPS
        GAMA_WORLD --> DISPATCHER
    end

    subgraph COMMS ["Capa de Comunicación en Tiempo Real"]
        direction LR
        WS_SERVER["WebSocket Server (ws://localhost:6868)"]
        TCP_STREAM["Protocolo Binario Framing RFC 6455 / JSON RPC"]
        WS_SERVER <--> TCP_STREAM
    end

    subgraph CLIENT ["Capa de Presentación y Auditoría (React Vite)"]
        direction TB
        SOCKET_SVC["gamaSocket.js (Connection Manager & Auto-Reconnect)"]
        NOTIF_SVC["notificationService.js (Push Engine & Auditoría)"]
        DASHBOARD["ParkingDashboard.jsx (Motor Reactivo de Telemetría)"]
        BLUEPRINT["ParkingFloorPlan.jsx (Render Vectorial 2D 100 Plazas/Planta)"]
        NOTIF_CENTER["ParkingNotificationCenter.jsx (Pantalla de Auditoría & WhatsApp API)"]
        
        SOCKET_SVC --> DASHBOARD
        DASHBOARD --> BLUEPRINT
        DASHBOARD --> NOTIF_SVC
        NOTIF_SVC --> NOTIF_CENTER
    end

    KERNEL <-->|Telemetría Cíclica (1 Hz) / Comandos 'ask'| COMMS
    COMMS <-->|Streaming Bidireccional de Baja Latencia| CLIENT
```

---

## 2. Conceptos Fuertes de Programación en Tiempo Real (Puntos Clave de Valoración)

Los siguientes módulos representan la aplicación práctica de algoritmos y patrones de diseño propios de los **Sistemas Distribuidos de Tiempo Real (SDTR)**:

### 2.1. Control de Concurrencia en Rampas (Exclusión Mutua / Semáforo de Dijkstra)
* **Problema**: Las rampas inter-planta (Planta A $\leftrightarrow$ B, B $\leftrightarrow$ C, C $\leftrightarrow$ D) poseen capacidad crítica de un solo carril alternado. Si dos vehículos ingresan en direcciones opuestas simultáneamente, se produce un bloqueo mutuo irreparable (**Deadlock**).
* **Solución SDTR**: Implementación de un **Semáforo Binario / Mutex** por rampa con política de turnos temporizados ($T_{green} = 15\text{s}$) y despeje de zona crítica ($T_{clear} = 3\text{s}$):
  $$\text{Estado Mutex} \in \{\text{LIBRE}, \text{SUBIENDO}, \text{BAJANDO}, \text{DESPEJE\_AMBAR}, \text{BLOQUEADO}\}$$
* **Garantía Formal**: 
  - **Exclusión Mutua**: A lo sumo un único sentido de circulación tiene concedida la sección crítica.
  - **Prevención de Inanición (Starvation-Free)**: Si hay vehículos esperando en el sentido opuesto, el semáforo conmuta automáticamente al expirar el quantum de tiempo.
  - **Override de Emergencia**: Ante señal de alarma de evacuación, el semáforo fuerza todos los mutex en sentido **BAJADA**, bloqueando inmediatamente la entrada de vehículos ascendentes.

### 2.2. Asignación Predictiva de Plazas (Smart Dispatching)
* **Problema**: La búsqueda estocástica no guiada provoca vehículos erráticos dando vueltas por los pasillos, generando congestión en las entradas y aumento de emisiones contaminantes.
* **Solución SDTR**: En la barrera de ingreso, el sistema evalúa una función de costo multicriterio $J(s)$ para todas las plazas libres $s \in S_{\text{libres}}$ en tiempo $O(N)$ con cota acotada:
  $$J(s) = w_1 \cdot D_{\text{rampa}}(s) + w_2 \cdot C_{\text{pasillo}}(\text{corredor}(s)) + w_3 \cdot \Delta_{\text{bahia}}(s)$$
  - $D_{\text{rampa}}(s)$: Distancia en metros desde la rampa de acceso al piso.
  - $C_{\text{pasillo}}$: Densidad de ocupación del pasillo intermedio (evita enviar autos por pasillos con tránsito saturado).
  - $\Delta_{\text{bahia}}$: Penalización por contigüidad (evita saturar dos bahías adyacentes al mismo tiempo).
* **Resultado**: Asignación óptima y deterministicamente calculada antes de levantar la barrera de acceso, con cálculo de tiempo estimado de arribo ($\text{ETA}$).

### 2.3. Protocolo de Evacuación Crítica y WCET (Worst-Case Evacuation Time)
* **Problema**: En caso de siniestro (incendio, escape de gas, colapso estructural), el estacionamiento debe desalojar hasta 400 vehículos de forma determinista y segura.
* **Solución SDTR**:
  - Un evento de alta prioridad interrumpe el ciclo operativo normal.
  - Se levantan todas las barreras sin validación de ticket ni cobro.
  - Las rampas se conmutan a modo unidireccional descendente de escape.
  - El sistema monitoriza y calcula en tiempo real el **WCET**:
    $$\text{WCET} = \max_{v \in V_{\text{estacionados}}} \left( T_{\text{maniobra}}(v) + \sum_{p \in \text{ruta}(v)} \frac{L(p)}{V_{\text{evac}}(p)} + T_{\text{espera\_rampa}} \right)$$
  - Un temporizador con cuenta regresiva mide el tiempo transcurrido versus el umbral máximo de seguridad de la normativa (300 segundos).

### 2.4. Libro Mayor de Accesos Inmutable y Facturación Determinista
* Cada ingreso y egreso registra una tupla temporal $(V_{\text{id}}, S_{\text{id}}, T_{\text{in}}, T_{\text{out}}, \Delta t, \text{Tarifa})$.
* El cálculo de tarifas en tiempo real aplica funciones lineales con tarifa base y fraccionamiento por minuto exacto, garantizando consistencia transaccional sin condiciones de carrera.

---

## 3. Conceptos Débiles y Limitaciones (Análisis Crítico para la Defensa Oral)

Para demostrar dominio senior y espíritu crítico durante la defensa de la materia, es fundamental no solo exponer los éxitos del diseño sino también justificar sus **compromisos de ingeniería (trade-offs)** y reconocer las limitaciones inherentes a la pila tecnológica elegida:

### 3.1. Clasificación: Soft Real-Time vs. Hard Real-Time
* **Estado Actual**: Nuestro sistema clasifica como un **Sistema de Tiempo Real Blando (Soft Real-Time)**.
* **Fundamento**: 
  - El incumplimiento esporádico de un plazo (por ejemplo, si un frame de telemetría tarda 1.4s en lugar de 1.0s) degrada la fluidez visual del operador humano en el dashboard, pero **no ocasiona fallas catastróficas, daños materiales ni pérdida de vidas humanas**.
  - En un entorno de **Tiempo Real Estricto (Hard Real-Time)** —como el control fly-by-wire de un avión o los frenos ABS de un automóvil—, un deadline miss se considera una falla total del sistema.
* **Conclusión para la defensa**: La arquitectura web elegida (React + WebSocket) es idónea y costo-efectiva para tareas de SCADA, supervisión de tráfico y control de acceso comercial, donde latencias de 50-100 ms son completamente aceptables.

### 3.2. Jitter Introducido por Recolección de Basura (Garbage Collection Jitter)
* **Limitación**: Tanto la plataforma GAMA (ejecutada sobre la máquina virtual Java / OpenJDK) como el frontend y mock server (ejecutados sobre el motor V8 de Node.js / navegador) utilizan **administración automática de memoria mediante Garbage Collector**.
* **Impacto**:
  - Los ciclos de recolección de basura (*Stop-the-World pauses*) ocurren en momentos no deterministas.
  - Aunque el tiempo promedio de respuesta sea de 10 ms, en el percentil 99 (p99) una pausa de GC puede introducir un pico de latencia de 150-300 ms (*Jitter*).
* **Alternativa Hard Real-Time**: Sistemas basados en lenguajes compilados sin GC (C, C++, Rust, Ada) o con ejecutores deterministas como RTEMS, FreeRTOS o Linux con parche `PREEMPT_RT`.

### 3.3. Bloqueo en Cabeza de Línea (TCP Head-of-Line Blocking) sobre WebSockets
* **Limitación**: WebSockets opera sobre el protocolo de transporte **TCP (Transmission Control Protocol)**.
* **Impacto**:
  - TCP garantiza entrega ordenada y sin pérdidas. Si un paquete IP se pierde o se corrompe en la red, la pila TCP retiene todos los paquetes posteriores en el búfer del sistema operativo hasta que el paquete perdido sea retransmitido con éxito.
  - Esto produce el fenómeno conocido como **Head-of-Line (HoL) Blocking**, donde una ráfaga de datos de telemetría fresca queda retenida esperando un paquete antiguo.
* **Alternativa de Tiempo Real Industrial**: Protocolos basados en UDP con capas de confiabilidad configurables, tales como **DDS (Data Distribution Service)**, **WebTransport / QUIC**, o **RTPS (Real-Time Publish-Subscribe)** estándar en robótica autónoma (ROS 2).

### 3.4. Concurrencia Cooperativa en el Event Loop Monohilo (Single-Thread)
* **Limitación**: JavaScript en el navegador ejecuta sobre un **Event Loop monohilo cooperativo**.
* **Impacto**:
  - Si una operación de renderizado o cálculo pesado (por ejemplo, un algoritmo de ruteo muy complejo sobre 5.000 nodos) toma 60 ms de CPU continua, **bloquea la recepción de eventos del socket y el refresco visual**.
* **Mitigación implementada**:
  - Los cálculos de búsqueda de plazas y mutaciones de estado se mantienen ligeros ($O(N)$ con $N=400$).
  - Para arquitecturas a gran escala, la delegación a **Web Workers** (hilos dedicados independientes en segundo plano) permite procesar telemetría sin afectar los 60 FPS de la interfaz gráfica.

### 3.5. Deriva de Relojes y Sincronización Temporal (Clock Drift)
* **Limitación**: El servidor de simulación y los navegadores clientes utilizan sus relojes locales basados en el reloj de sistema operativo (sincronizados convencionalmente vía NTP - Network Time Protocol).
* **Impacto**: NTP proporciona una precisión de milisegundos (típicamente $\pm 10$ a $\pm 50\text{ ms}$ en Internet). Existe una leve deriva de reloj (*drift*) entre la marca de tiempo generada por el agente en simulación y el receptor del navegador.
* **Solución de Grado Crítico**: En entornos de tiempo real estricto se emplea el protocolo **PTP (Precision Time Protocol / IEEE 1588)**, el cual utiliza timestamping a nivel de hardware en la tarjeta de red (NIC) para lograr sincronizaciones sub-microsegundo.

---

## 4. Cuadro Comparativo: Sistema Actual vs. Sistema Hard Real-Time Teórico

| Dimensión | Implementación Actual (SDTR Trabajo Integrador) | Sistema Teórico Hard Real-Time (Crítico) |
| :--- | :--- | :--- |
| **Clasificación de Plazo** | **Soft Real-Time**: Degrada calidad de servicio ante demoras | **Hard Real-Time**: Pérdida de deadline = Falla del sistema |
| **Entorno de Ejecución** | Java Virtual Machine (GAMA) + Motor V8 (JavaScript) | RTOS (FreeRTOS, VxWorks, QNX, Zephyr) o Linux PREEMPT_RT |
| **Gestión de Memoria** | Heap dinámico con Garbage Collector no determinista | Asignación estática en tiempo de compilación o pools de memoria fijos |
| **Transporte de Red** | WebSocket sobre TCP (RFC 6455) | UDP / Multicast / DDS / TSN (Time-Sensitive Networking) |
| **Sincronización de Reloj** | Timestamping software + NTP ($\approx 10\text{ ms}$) | IEEE 1588 PTP por hardware ($\le 1\ \mu\text{s}$) |
| **Control de Concurrencia** | Máquina de estados en GAMA + Mutex lógico de rampa | Semáforos prioritarios con protocolo de herencia de prioridad (PIP/PCP) |
| **Interfaz de Usuario** | Web Dashboard reactivo moderno (React Vite) | Panel HMI industrial embebido de respuesta determinista |

---

## 5. Resumen de Respuestas para Preguntas del Tribunal

1. **¿Por qué dicen que el sistema es de tiempo real si está hecho en Web?**
   > *"Es un Sistema de Tiempo Real Blando (Soft Real-Time). El motor de simulación opera con un ciclo de cómputo periódico estricto (1 Hz) donde cada ciclo calcula la física, colisiones y semáforos antes de emitir la telemetría. La web actúa como panel de supervisión SCADA con un WebSocket duplex permanente. La corrección del sistema no solo depende del resultado lógico sino también del momento en que se produce."*

2. **¿Cómo garantizan que dos autos no choquen en la rampa?**
   > *"A través de un Mutex de Rampa basado en el algoritmo de semáforo de Dijkstra. El carril central alternado es una Sección Crítica que exige adquisición de token antes de entrar. Si el semáforo está en verde de bajada, los autos de subida son encolados en espera. Un estado de despeje ámbar de 3 segundos asegura que la rampa esté físicamente vacía antes de conmutar la dirección."*

3. **¿Qué ocurre si la red se cae o hay congestión de tráfico?**
   > *"En la capa de transporte, TCP retransmite los paquetes. Sin embargo, en el cliente implementamos una arquitectura desacoplada en `gamaSocket.js` con reconexión exponencial y simulación local en fallback: si el servidor se desconecta, el cliente continúa registrando telemetría y preserva el libro mayor de auditoría de los vehículos estacionados."*

