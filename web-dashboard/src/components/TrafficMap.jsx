import React, { useState, useMemo } from 'react';

/**
 * Coordenadas espaciales exactas de la red vial de RoadTrafficSDTR.gaml (GAMA Platform)
 * Espacio de simulación: 1200m x 1200m
 */
const ROAD_GEOMETRIES = [
  {
    id: 'libertador',
    name: 'Av. Libertador Norte',
    type: 'avenue',
    x1: 100,
    y1: 300,
    x2: 1100,
    y2: 300,
    capacity: 40,
    maxSpeed: '60 km/h',
  },
  {
    id: 'autopista',
    name: 'Autopista Central',
    type: 'highway',
    x1: 100,
    y1: 600,
    x2: 1100,
    y2: 600,
    capacity: 70,
    maxSpeed: '80 km/h',
  },
  {
    id: 'corrientes',
    name: 'Av. Corrientes Sur',
    type: 'avenue',
    x1: 100,
    y1: 900,
    x2: 1100,
    y2: 900,
    capacity: 40,
    maxSpeed: '50 km/h',
  },
  {
    id: 'transversal_oeste',
    name: 'Transversal Oeste',
    type: 'street',
    x1: 300,
    y1: 100,
    x2: 300,
    y2: 1100,
    capacity: 30,
    maxSpeed: '40 km/h',
  },
  {
    id: 'eje_civico',
    name: 'Eje Cívico Central',
    type: 'avenue',
    x1: 600,
    y1: 100,
    x2: 600,
    y2: 1100,
    capacity: 35,
    maxSpeed: '45 km/h',
  },
  {
    id: 'conector_este',
    name: 'Conector Este',
    type: 'street',
    x1: 900,
    y1: 100,
    x2: 900,
    y2: 1100,
    capacity: 30,
    maxSpeed: '40 km/h',
  },
];

// Nodos / Intersecciones semafóricas (puntos de cruce)
const INTERSECTIONS = [
  { x: 300, y: 300, name: 'Cruce Libertador & Transversal Oeste' },
  { x: 600, y: 300, name: 'Cruce Libertador & Eje Cívico' },
  { x: 900, y: 300, name: 'Cruce Libertador & Conector Este' },
  { x: 300, y: 600, name: 'Distribuidor Autopista Oeste' },
  { x: 600, y: 600, name: 'Distribuidor Central' },
  { x: 900, y: 600, name: 'Distribuidor Autopista Este' },
  { x: 300, y: 900, name: 'Cruce Corrientes & Transversal Oeste' },
  { x: 600, y: 900, name: 'Cruce Corrientes & Eje Cívico' },
  { x: 900, y: 900, name: 'Cruce Corrientes & Conector Este' },
];

/**
 * Determina el color cromático de la arteria según su densidad porcentual
 */
function getDensityColor(density) {
  if (density >= 80) return { stroke: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)', label: 'Crítico' };
  if (density >= 60) return { stroke: '#f97316', glow: 'rgba(249, 115, 22, 0.5)', label: 'Congestionado' };
  if (density >= 35) return { stroke: '#eab308', glow: 'rgba(234, 179, 8, 0.4)', label: 'Moderado' };
  return { stroke: '#10b981', glow: 'rgba(16, 185, 129, 0.4)', label: 'Fluido' };
}

/**
 * TrafficMap
 * Mapa interactivo vectorial SVG con renderizado en tiempo real de arterias,
 * densidades coloreadas, vehículos dinámicos e inspección de tramos al hacer clic/hover.
 */
export const TrafficMap = React.memo(function TrafficMap({
  roadDensities = [],
  activeVehicles = 0,
}) {
  const [selectedRoadId, setSelectedRoadId] = useState(null);
  const [hoveredRoadId, setHoveredRoadId] = useState(null);

  // Mapear densidades actuales de la telemetría recibida con las geometrías viales
  const roadsWithData = useMemo(() => {
    return ROAD_GEOMETRIES.map((road) => {
      // Buscar en telemetría por ID o por nombre de arteria
      const telemetry = roadDensities.find(
        (r) =>
          r.id === road.id ||
          (r.name && r.name.toLowerCase().includes(road.name.toLowerCase())) ||
          (road.id === 'libertador' && r.name?.includes('Libertador')) ||
          (road.id === 'autopista' && (r.name?.includes('Autopista') || r.name?.includes('Central'))) ||
          (road.id === 'corrientes' && r.name?.includes('Corrientes')) ||
          (road.id === 'transversal_oeste' && r.name?.includes('Oeste')) ||
          (road.id === 'eje_civico' && (r.name?.includes('Cívico') || r.name?.includes('Civico'))) ||
          (road.id === 'conector_este' && r.name?.includes('Este'))
      );

      const density = telemetry ? Math.min(100, Math.max(0, telemetry.density ?? telemetry.congestion ?? 0)) : 25;
      const vehicles = telemetry ? (telemetry.vehicles ?? Math.round((density / 100) * road.capacity)) : Math.round((density / 100) * road.capacity);
      const colorInfo = getDensityColor(density);

      return {
        ...road,
        density,
        vehicles,
        colorInfo,
      };
    });
  }, [roadDensities]);

  const activeRoad = useMemo(() => {
    const targetId = hoveredRoadId || selectedRoadId;
    if (!targetId) return null;
    return roadsWithData.find((r) => r.id === targetId);
  }, [hoveredRoadId, selectedRoadId, roadsWithData]);

  // Generación determinística de posiciones de vehículos a lo largo de las vías
  const vehicleParticles = useMemo(() => {
    const particles = [];
    const countPerRoad = Math.min(12, Math.max(2, Math.round(activeVehicles / 20)));

    roadsWithData.forEach((road) => {
      const numVehicles = Math.max(1, Math.min(countPerRoad, Math.round((road.density / 100) * 10)));

      for (let i = 0; i < numVehicles; i++) {
        // Distribución pseudo-aleatoria pero suave a lo largo de la traza
        const ratio = (i + 0.5) / numVehicles;
        const x = road.x1 + (road.x2 - road.x1) * ratio;
        const y = road.y1 + (road.y2 - road.y1) * ratio;

        particles.push({
          id: `${road.id}-v-${i}`,
          x,
          y,
          color: road.colorInfo.stroke,
          isHighway: road.type === 'highway',
        });
      }
    });

    return particles;
  }, [roadsWithData, activeVehicles]);

  return (
    <div className="panel-card traffic-map-panel">
      <div className="panel-header">
        <div className="header-title">
          <span className="control-icon">🗺️</span>
          <div>
            <h3>Mapa Interactivo de Tráfico Vial (Red SDTR)</h3>
            <span className="panel-hint">
              Topología multi-agente en tiempo real ({activeVehicles} vehículos en circulación)
            </span>
          </div>
        </div>

        {/* Leyenda cromática de congestión */}
        <div className="map-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#10b981' }} /> Fluido (&lt;35%)
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#eab308' }} /> Moderado (35-60%)
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#f97316' }} /> Congestionado (60-80%)
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: '#ef4444' }} /> Crítico (&gt;80%)
          </span>
        </div>
      </div>

      <div className="map-viewport-wrapper">
        <svg
          viewBox="0 0 1200 1200"
          className="traffic-svg-map"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Patrón de cuadrícula urbana de fondo */}
            <pattern id="urban-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
            </pattern>

            {/* Filtros de resplandor para arterias */}
            <filter id="road-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>

            {/* Gradientes para las zonas urbanas */}
            <linearGradient id="district-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(30, 41, 59, 0.4)" />
              <stop offset="100%" stopColor="rgba(15, 23, 42, 0.7)" />
            </linearGradient>
          </defs>

          {/* Fondo del mapa y cuadrícula */}
          <rect width="1200" height="1200" fill="url(#district-grad)" rx="16" />
          <rect width="1200" height="1200" fill="url(#urban-grid)" />

          {/* Manzanas / Zonas de distritos urbanos */}
          <g className="city-blocks" opacity="0.6">
            <rect x="130" y="130" width="140" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="330" y="130" width="240" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="630" y="130" width="240" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="930" y="130" width="140" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />

            <rect x="130" y="330" width="140" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="330" y="330" width="240" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="630" y="330" width="240" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="930" y="330" width="140" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />

            <rect x="130" y="630" width="140" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="330" y="630" width="240" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="630" y="630" width="240" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="930" y="630" width="140" height="240" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />

            <rect x="130" y="930" width="140" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="330" y="930" width="240" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="630" y="930" width="240" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
            <rect x="930" y="930" width="140" height="140" rx="6" fill="#182234" stroke="rgba(255,255,255,0.05)" />
          </g>

          {/* Trazas de asfalto base de las arterias */}
          <g className="road-bases">
            {roadsWithData.map((road) => (
              <line
                key={`base-${road.id}`}
                x1={road.x1}
                y1={road.y1}
                x2={road.x2}
                y2={road.y2}
                stroke="#1e293b"
                strokeWidth={road.type === 'highway' ? 32 : 22}
                strokeLinecap="round"
              />
            ))}
          </g>

          {/* Arterias dinámicas con colores de densidad en tiempo real */}
          <g className="road-active-layers">
            {roadsWithData.map((road) => {
              const isSelected = selectedRoadId === road.id;
              const isHovered = hoveredRoadId === road.id;
              const strokeWidth = road.type === 'highway' ? (isSelected ? 20 : 16) : (isSelected ? 16 : 12);

              return (
                <g key={`road-group-${road.id}`}>
                  {/* Línea de resplandor (Glow) para congestión alta */}
                  {road.density > 60 && (
                    <line
                      x1={road.x1}
                      y1={road.y1}
                      x2={road.x2}
                      y2={road.y2}
                      stroke={road.colorInfo.glow}
                      strokeWidth={strokeWidth + 14}
                      strokeLinecap="round"
                      filter="url(#road-glow)"
                      opacity={road.density > 80 ? 0.9 : 0.6}
                      className={road.density > 80 ? 'pulse-road' : ''}
                    />
                  )}

                  {/* Vía principal coloreada */}
                  <line
                    x1={road.x1}
                    y1={road.y1}
                    x2={road.x2}
                    y2={road.y2}
                    stroke={road.colorInfo.stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    className="interactive-road"
                    onMouseEnter={() => setHoveredRoadId(road.id)}
                    onMouseLeave={() => setHoveredRoadId(null)}
                    onClick={() => setSelectedRoadId(road.id === selectedRoadId ? null : road.id)}
                    style={{
                      cursor: 'pointer',
                      transition: 'stroke 0.4s ease, stroke-width 0.2s ease',
                      filter: isHovered || isSelected ? 'brightness(1.3)' : 'none',
                    }}
                  />

                  {/* Línea central punteada de carril */}
                  <line
                    x1={road.x1}
                    y1={road.y1}
                    x2={road.x2}
                    y2={road.y2}
                    stroke="rgba(255, 255, 255, 0.4)"
                    strokeWidth="2"
                    strokeDasharray={road.type === 'highway' ? '12 8' : '8 6'}
                    pointerEvents="none"
                  />
                </g>
              );
            })}
          </g>

          {/* Intersecciones semafóricas (Nodos del grafo vial) */}
          <g className="intersections">
            {INTERSECTIONS.map((node, idx) => (
              <g key={`node-${idx}`} transform={`translate(${node.x}, ${node.y})`}>
                <circle r="14" fill="#0f172a" stroke="#475569" strokeWidth="3" />
                <circle r="5" fill="#38bdf8" />
              </g>
            ))}
          </g>

          {/* Partículas de vehículos en circulación */}
          <g className="vehicles-layer" pointerEvents="none">
            {vehicleParticles.map((v) => (
              <circle
                key={v.id}
                cx={v.x}
                cy={v.y}
                r={v.isHighway ? 6 : 5}
                fill="#ffffff"
                stroke={v.color}
                strokeWidth="2"
                className="vehicle-dot"
                style={{
                  filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8))',
                }}
              />
            ))}
          </g>

          {/* Etiquetas con nombres de las arterias */}
          <g className="road-labels" pointerEvents="none">
            {roadsWithData.map((road) => {
              const isHorizontal = road.y1 === road.y2;
              const textX = isHorizontal ? 600 : road.x1 + 18;
              const textY = isHorizontal ? road.y1 - 16 : 600;
              const transform = !isHorizontal ? `rotate(-90, ${road.x1}, 600)` : undefined;

              return (
                <text
                  key={`label-${road.id}`}
                  x={textX}
                  y={textY}
                  transform={transform}
                  textAnchor="middle"
                  fill="rgba(248, 250, 252, 0.9)"
                  fontSize="14"
                  fontWeight="600"
                  fontFamily="system-ui, sans-serif"
                  style={{
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                    letterSpacing: '0.4px',
                  }}
                >
                  {road.name} • {Math.round(road.density)}%
                </text>
              );
            })}
          </g>
        </svg>

        {/* HUD flotante con telemetría de la arteria inspeccionada */}
        {activeRoad && (
          <div className="road-hud-card">
            <div className="hud-header">
              <span className="hud-title">{activeRoad.name}</span>
              <span
                className="hud-badge"
                style={{
                  backgroundColor: activeRoad.colorInfo.glow,
                  color: activeRoad.colorInfo.stroke,
                  borderColor: activeRoad.colorInfo.stroke,
                }}
              >
                {activeRoad.colorInfo.label}
              </span>
            </div>

            <div className="hud-stats-grid">
              <div className="hud-stat">
                <span className="stat-label">Saturación:</span>
                <span className="stat-value" style={{ color: activeRoad.colorInfo.stroke }}>
                  {Math.round(activeRoad.density)}%
                </span>
              </div>

              <div className="hud-stat">
                <span className="stat-label">Vehículos:</span>
                <span className="stat-value">
                  {activeRoad.vehicles} / {activeRoad.capacity}
                </span>
              </div>

              <div className="hud-stat">
                <span className="stat-label">Velocidad Máx:</span>
                <span className="stat-value">{activeRoad.maxSpeed}</span>
              </div>
            </div>

            <div className="hud-progress-bar">
              <div
                className="hud-progress-fill"
                style={{
                  width: `${activeRoad.density}%`,
                  backgroundColor: activeRoad.colorInfo.stroke,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export default TrafficMap;
