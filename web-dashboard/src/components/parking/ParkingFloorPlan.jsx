import React from 'react';

/**
 * ParkingFloorPlan
 * Plano arquitectónico 2D interactivo para una planta de estacionamiento de 100 plazas.
 * - Disposición: 4 bahías de estacionamiento (25 plazas c/u) con pasillos de circulación vehicular.
 * - Plazas Especiales: PMR (Movilidad Reducida ♿) y Electrolineras (EV ⚡ con % de carga).
 * - Ascensor Peatonal y trazado de ruta de caminata cuando se busca un vehículo.
 * - Semáforos viales en rampas y modo de evacuación de emergencia.
 */
export const ParkingFloorPlan = React.memo(function ParkingFloorPlan({
  floor = 'A',
  spots = [],
  selectedSpot = null,
  onSelectSpot,
  isJamActive = false,
  inTransit = 0,
  isEmergency = false,
  searchedSpotId = null,
}) {
  // Organizar los 100 puestos en 4 filas de 25
  const row1 = spots.filter((s) => s.num >= 1 && s.num <= 25);
  const row2 = spots.filter((s) => s.num >= 26 && s.num <= 50);
  const row3 = spots.filter((s) => s.num >= 51 && s.num <= 75);
  const row4 = spots.filter((s) => s.num >= 76 && s.num <= 100);

  const CAR_COLORS = [
    '#3b82f6', // azul
    '#ef4444', // rojo
    '#10b981', // verde esmeralda
    '#f59e0b', // ámbar
    '#8b5cf6', // violeta
    '#64748b', // gris plata
    '#06b6d4', // cian
  ];

  const getCarColor = (plate = '') => {
    let hash = 0;
    for (let i = 0; i < plate.length; i++) {
      hash = (hash << 5) - hash + plate.charCodeAt(i);
    }
    const idx = Math.abs(hash) % CAR_COLORS.length;
    return CAR_COLORS[idx];
  };

  // Coordenadas del puesto para trazado peatonal
  const getSpotCoordinates = (num) => {
    if (num >= 1 && num <= 25) {
      return { x: 60 + (num - 1) * 34.4 + 16, y: 30 + 27, aisleY: 110 };
    }
    if (num >= 26 && num <= 50) {
      return { x: 60 + (num - 26) * 34.4 + 16, y: 135 + 27, aisleY: 110 };
    }
    if (num >= 51 && num <= 75) {
      return { x: 60 + (num - 51) * 34.4 + 16, y: 290 + 27, aisleY: 370 };
    }
    return { x: 60 + (num - 76) * 34.4 + 16, y: 395 + 27, aisleY: 370 };
  };

  // Renderizador de un puesto individual dentro del SVG
  const renderSpot = (spot, x, y, width = 34, height = 55, isFlipped = false) => {
    if (!spot) return null;
    const isSelected = selectedSpot?.id === spot.id;
    const isSearched = searchedSpotId === spot.id;
    const carColor = getCarColor(spot.car);

    const isPMR = spot.spotType === 'PMR';
    const isEV = spot.spotType === 'EV';

    return (
      <g
        key={spot.id}
        transform={`translate(${x}, ${y})`}
        onClick={() => onSelectSpot && onSelectSpot(spot)}
        style={{ cursor: 'pointer' }}
        className="svg-spot-group"
      >
        {/* Halo pulsante si es el auto buscado */}
        {isSearched && (
          <rect
            x={-4}
            y={-4}
            width={width + 8}
            height={height + 8}
            rx={6}
            fill="rgba(56, 189, 248, 0.25)"
            stroke="#38bdf8"
            strokeWidth={2.5}
            className="searched-spot-halo"
          />
        )}

        {/* Fondo de la plaza */}
        <rect
          x={0}
          y={0}
          width={width}
          height={height}
          rx={3}
          fill={
            isSelected
              ? 'rgba(59, 130, 246, 0.25)'
              : isPMR
                ? 'rgba(14, 165, 233, 0.12)'
                : isEV
                  ? 'rgba(16, 185, 129, 0.12)'
                  : spot.occ
                    ? 'rgba(239, 68, 68, 0.08)'
                    : 'rgba(16, 185, 129, 0.05)'
          }
          stroke={
            isSelected
              ? '#3b82f6'
              : isPMR
                ? '#0ea5e9'
                : isEV
                  ? '#10b981'
                  : spot.occ
                    ? 'rgba(239, 68, 68, 0.4)'
                    : 'rgba(16, 185, 129, 0.3)'
          }
          strokeWidth={isSelected || isSearched ? 2 : 1}
          strokeDasharray={isSelected ? 'none' : '2,2'}
        />

        {/* Número de puesto e icono de tipo */}
        <text
          x={width / 2}
          y={isFlipped ? height - 6 : 11}
          fill="rgba(255, 255, 255, 0.7)"
          fontSize="7.5"
          fontWeight="700"
          textAnchor="middle"
          fontFamily="monospace"
        >
          {isPMR ? `♿${spot.num}` : isEV ? `⚡${spot.num}` : spot.num}
        </text>

        {/* Sensor cenital LED */}
        <circle
          cx={width / 2}
          cy={isFlipped ? 8 : height - 8}
          r={3}
          fill={spot.occ ? '#ef4444' : '#10b981'}
          filter={`drop-shadow(0 0 4px ${spot.occ ? '#ef4444' : '#10b981'})`}
        />

        {/* Indicador de carga para plazas EV ocupadas */}
        {isEV && spot.occ && (
          <text
            x={width / 2}
            y={isFlipped ? 20 : height - 16}
            fill="#10b981"
            fontSize="5"
            fontWeight="800"
            textAnchor="middle"
            fontFamily="monospace"
          >
            ⚡{spot.batteryLevel || 70}%
          </text>
        )}

        {/* Pin indicador sobre el auto buscado */}
        {isSearched && (
          <g transform={`translate(${width / 2 - 6}, -14)`}>
            <circle cx={6} cy={6} r={5} fill="#38bdf8" />
            <text x={6} y={9} fill="#000" fontSize="7" fontWeight="900" textAnchor="middle">
              ▼
            </text>
          </g>
        )}

        {/* Vehículo estacionado (si está ocupado) */}
        {spot.occ && (
          <g transform={`translate(${width / 2 - 10}, ${isFlipped ? 12 : 12})`}>
            {/* Silueta de carrocería vista superior */}
            <rect
              x={0}
              y={0}
              width={20}
              height={32}
              rx={5}
              fill={carColor}
              stroke="#ffffff"
              strokeWidth={0.8}
              strokeOpacity={0.6}
            />
            {/* Parabrisas delantero */}
            <rect
              x={2.5}
              y={isFlipped ? 20 : 6}
              width={15}
              height={5}
              rx={1.5}
              fill="#0f172a"
              opacity={0.85}
            />
            {/* Luneta trasera */}
            <rect
              x={3.5}
              y={isFlipped ? 5 : 22}
              width={13}
              height={3.5}
              rx={1}
              fill="#0f172a"
              opacity={0.8}
            />
            {/* Luces */}
            <circle cx={4} cy={isFlipped ? 30 : 2} r={1.2} fill={isFlipped ? '#ef4444' : '#fef08a'} />
            <circle cx={16} cy={isFlipped ? 30 : 2} r={1.2} fill={isFlipped ? '#ef4444' : '#fef08a'} />
            {/* Patente miniatura */}
            <rect x={3} y={13} width={14} height={5} rx={1} fill="#ffffff" />
            <text
              x={10}
              y={17}
              fill="#000000"
              fontSize="4"
              fontWeight="900"
              textAnchor="middle"
              fontFamily="monospace"
            >
              {spot.car ? spot.car.slice(0, 5) : 'AUTO'}
            </text>
          </g>
        )}
      </g>
    );
  };

  // Coordenadas para la ruta de caminata desde el ascensor si hay auto buscado en este piso
  const searchedSpot = spots.find((s) => s.id === searchedSpotId);
  const searchedCoords = searchedSpot ? getSpotCoordinates(searchedSpot.num) : null;

  return (
    <div className="parking-floorplan-container">
      <div className="floorplan-hud-top">
        <div className="hud-badge">
          <span className="hud-dot" />
          <span>PLANO ARQUITECTÓNICO • PLANTA {floor}</span>
        </div>
        <div className="hud-legend">
          <span className="legend-item">
            <span className="legend-light light-green" /> Disponible
          </span>
          <span className="legend-item">
            <span className="legend-light light-red" /> Ocupado
          </span>
          <span className="legend-item">
            <span style={{ color: '#0ea5e9' }}>♿</span> PMR (1-6)
          </span>
          <span className="legend-item">
            <span style={{ color: '#10b981' }}>⚡</span> EV Electrolinera (7-14)
          </span>
        </div>
      </div>

      <svg
        viewBox="0 0 980 500"
        className="parking-blueprint-svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Textura de asfalto y marcas viales */}
          <pattern id="asphalt-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
            <rect width="20" height="20" fill="#0b111e" />
            <circle cx="2" cy="2" r="0.8" fill="#152033" />
            <circle cx="12" cy="14" r="0.6" fill="#152033" />
          </pattern>
          {/* Patrón de líneas de advertencia de rampa */}
          <pattern id="ramp-stripes" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="16" stroke="#f59e0b" strokeWidth="4" />
            <line x1="8" y1="0" x2="8" y2="16" stroke="#1e293b" strokeWidth="4" />
          </pattern>
        </defs>

        {/* Piso de hormigón / asfalto general */}
        <rect x={10} y={10} width={960} height={480} rx={12} fill="url(#asphalt-pattern)" stroke="#1e293b" strokeWidth={2} />

        {/* ------------------------------------------------------------- */}
        {/* NÚCLEO DE ASCENSOR PEATONAL (Punto de Partida de Búsqueda) */}
        {/* ------------------------------------------------------------- */}
        <g transform="translate(16, 30)">
          <rect x={0} y={0} width={34} height={55} rx={5} fill="#1e293b" stroke="#38bdf8" strokeWidth={1.5} />
          <text x={17} y={18} fill="#38bdf8" fontSize="11" textAnchor="middle">🚪</text>
          <text x={17} y={32} fill="#ffffff" fontSize="6.5" fontWeight="800" textAnchor="middle">ASCENSOR</text>
          <text x={17} y={42} fill="rgba(255,255,255,0.6)" fontSize="5.5" textAnchor="middle">PEATONAL</text>
        </g>

        {/* ------------------------------------------------------------- */}
        {/* Rampa de Ingreso (Lado Izquierdo) */}
        {/* ------------------------------------------------------------- */}
        <g transform="translate(16, 170)">
          <rect x={0} y={0} width={34} height={140} rx={6} fill="url(#ramp-stripes)" stroke={isEmergency ? '#ef4444' : '#f59e0b'} strokeWidth={1} opacity={0.8} />
          <text
            x={17}
            y={70}
            transform="rotate(-90 17 70)"
            fill="#ffffff"
            fontSize="9"
            fontWeight="800"
            letterSpacing="2"
            textAnchor="middle"
          >
            {isEmergency ? 'ENTRADA CERRADA' : 'RAMPA ENTRADA'}
          </text>
          <polygon points="17,10 11,22 23,22" fill={isEmergency ? '#ef4444' : '#10b981'} />

          {/* Mini Semáforo Mutex de Entrada */}
          <rect x={38} y={10} width={8} height={18} rx={2} fill="#0f172a" stroke="#334155" strokeWidth={0.8} />
          <circle cx={42} cy={14} r={2.2} fill={isEmergency ? '#ef4444' : '#334155'} />
          <circle cx={42} cy={22} r={2.2} fill={!isEmergency ? '#10b981' : '#334155'} />
        </g>

        {/* ------------------------------------------------------------- */}
        {/* Rampa de Egreso / Inter-piso (Lado Derecho) */}
        {/* ------------------------------------------------------------- */}
        <g transform="translate(930, 170)">
          <rect x={0} y={0} width={34} height={140} rx={6} fill="url(#ramp-stripes)" stroke={isEmergency || isJamActive ? '#ef4444' : '#f59e0b'} strokeWidth={isEmergency || isJamActive ? 2 : 1} opacity={0.8} />
          <text
            x={17}
            y={70}
            transform="rotate(90 17 70)"
            fill={isEmergency || isJamActive ? '#fca5a5' : '#ffffff'}
            fontSize="9"
            fontWeight="800"
            letterSpacing="2"
            textAnchor="middle"
          >
            {isEmergency ? 'EVACUACIÓN DESCARGA' : isJamActive ? 'RAMPA ATASCADA' : 'RAMPA INTER-PISO'}
          </text>
          <polygon points="17,130 11,118 23,118" fill={isJamActive ? '#ef4444' : '#38bdf8'} />

          {/* Mini Semáforo Mutex de Egreso */}
          <rect x={-12} y={10} width={8} height={26} rx={2} fill="#0f172a" stroke="#334155" strokeWidth={0.8} />
          <circle cx={-8} cy={14} r={2.2} fill={isJamActive ? '#ef4444' : '#334155'} />
          <circle cx={-8} cy={22} r={2.2} fill={isEmergency ? '#f59e0b' : '#334155'} />
          <circle cx={-8} cy={30} r={2.2} fill={!isJamActive && !isEmergency ? '#10b981' : '#334155'} />
        </g>

        {/* ------------------------------------------------------------- */}
        {/* Pasillo 1 (Norte) - Carril de circulación entre Fila 1 y Fila 2 */}
        {/* ------------------------------------------------------------- */}
        <g transform="translate(60, 90)">
          <rect x={0} y={0} width={860} height={40} fill="#0f172a" rx={4} />
          <line x1={0} y1={20} x2={860} y2={20} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={1.5} strokeDasharray="12,12" />
          <path d="M 120 20 L 140 20 M 134 15 L 140 20 L 134 25" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 430 20 L 450 20 M 444 15 L 450 20 L 444 25" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 740 20 L 760 20 M 754 15 L 760 20 L 754 25" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <text x={870} y={24} fill="#64748b" fontSize="8" fontWeight="600" textAnchor="end">CARRIL NORTE (1 a 50)</text>
        </g>

        {/* ------------------------------------------------------------- */}
        {/* Autopista Central de Maniobra */}
        {/* ------------------------------------------------------------- */}
        <g transform="translate(60, 205)">
          <rect x={0} y={0} width={860} height={70} fill="#0d1527" rx={6} stroke="rgba(56, 189, 248, 0.15)" strokeWidth={1} />
          <line x1={0} y1={33} x2={860} y2={33} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="16,8" />
          <line x1={0} y1={37} x2={860} y2={37} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="16,8" />

          <path d="M 200 20 L 220 20 M 214 15 L 220 20 L 214 25" stroke="#10b981" strokeWidth={2} strokeLinecap="round" fill="none" />
          <path d="M 600 50 L 580 50 M 586 45 L 580 50 L 586 55" stroke="#10b981" strokeWidth={2} strokeLinecap="round" fill="none" />

          <text x={430} y={22} fill="rgba(255,255,255,0.4)" fontSize="9" fontWeight="700" letterSpacing="1.5" textAnchor="middle">
            AVENIDA CENTRAL DE DISTRIBUCIÓN INTERNA
          </text>
          {inTransit > 0 && (
            <text x={430} y={55} fill="#38bdf8" fontSize="9" fontWeight="600" textAnchor="middle">
              🚗 {inTransit} vehículos circulando hacia plazas disponibles
            </text>
          )}
        </g>

        {/* ------------------------------------------------------------- */}
        {/* Pasillo 2 (Sur) - Carril de circulación entre Fila 3 y Fila 4 */}
        {/* ------------------------------------------------------------- */}
        <g transform="translate(60, 350)">
          <rect x={0} y={0} width={860} height={40} fill="#0f172a" rx={4} />
          <line x1={0} y1={20} x2={860} y2={20} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={1.5} strokeDasharray="12,12" />
          <path d="M 140 20 L 120 20 M 126 15 L 120 20 L 126 25" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 450 20 L 430 20 M 436 15 L 430 20 L 436 25" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M 760 20 L 740 20 M 746 15 L 740 20 L 746 25" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <text x={870} y={24} fill="#64748b" fontSize="8" fontWeight="600" textAnchor="end">CARRIL SUR (51 a 100)</text>
        </g>

        {/* ------------------------------------------------------------- */}
        {/* Trazado Peatonal: Ruta de caminata desde Ascensor hasta el Auto */}
        {/* ------------------------------------------------------------- */}
        {searchedCoords && (
          <g className="pedestrian-route-group">
            <path
              d={`M 33 85 L 33 ${searchedCoords.aisleY} L ${searchedCoords.x} ${searchedCoords.aisleY} L ${searchedCoords.x} ${searchedCoords.y}`}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={3}
              strokeDasharray="6,6"
              className="walking-path-animated"
            />
            {/* Marcador peatonal en movimiento */}
            <circle cx={33} cy={85} r={4} fill="#38bdf8" />
            <text x={33} y={75} fill="#38bdf8" fontSize="8" fontWeight="800" textAnchor="middle">
              🚶 INICIO
            </text>
          </g>
        )}

        {/* ------------------------------------------------------------- */}
        {/* FILA 1: Puestos 1 a 25 (Pared Superior Norte) */}
        {/* ------------------------------------------------------------- */}
        <g>
          {row1.map((spot, idx) => {
            const x = 60 + idx * 34.4;
            const y = 30;
            return renderSpot(spot, x, y, 32, 55, false);
          })}
        </g>

        {/* ------------------------------------------------------------- */}
        {/* FILA 2: Puestos 26 a 50 (Bahía Central Superior) */}
        {/* ------------------------------------------------------------- */}
        <g>
          {row2.map((spot, idx) => {
            const x = 60 + idx * 34.4;
            const y = 135;
            return renderSpot(spot, x, y, 32, 55, true);
          })}
        </g>

        {/* ------------------------------------------------------------- */}
        {/* FILA 3: Puestos 51 a 75 (Bahía Central Inferior) */}
        {/* ------------------------------------------------------------- */}
        <g>
          {row3.map((spot, idx) => {
            const x = 60 + idx * 34.4;
            const y = 290;
            return renderSpot(spot, x, y, 32, 55, false);
          })}
        </g>

        {/* ------------------------------------------------------------- */}
        {/* FILA 4: Puestos 76 a 100 (Pared Inferior Sur) */}
        {/* ------------------------------------------------------------- */}
        <g>
          {row4.map((spot, idx) => {
            const x = 60 + idx * 34.4;
            const y = 395;
            return renderSpot(spot, x, y, 32, 55, true);
          })}
        </g>
      </svg>
    </div>
  );
});

export default ParkingFloorPlan;
