import React, { useState, useMemo } from 'react';
import ParkingFloorPlan from './ParkingFloorPlan';

/**
 * ParkingFloorMap
 * Vista interactiva de planta de estacionamiento de 100 plazas:
 * - Modo Plano Arquitectónico 2D (con rampas, carriles viales, sentidos de circulación y siluetas de autos).
 * - Modo Grilla Matricial (100 celdas LED con micro-inspección de T_in).
 */
export const ParkingFloorMap = React.memo(function ParkingFloorMap({
  spots = [],
  activeFloor = 'A',
  onFloorChange,
  isJamActive = false,
  inTransit = 0,
}) {
  const [selectedFloor, setSelectedFloor] = useState(activeFloor || 'A');
  const [viewMode, setViewMode] = useState('PLAN'); // 'PLAN' | 'GRID'
  const [filterMode, setFilterMode] = useState('ALL'); // ALL | FREE | OCCUPIED
  const [selectedSpot, setSelectedSpot] = useState(null);

  const currentFloor = activeFloor || selectedFloor;

  const handleFloorSelect = (floor) => {
    setSelectedFloor(floor);
    if (onFloorChange) onFloorChange(floor);
    setSelectedSpot(null);
  };

  // Filtrar los 100 puestos del piso actual
  const floorSpots = useMemo(() => {
    const list = spots.filter((s) => s.floor === currentFloor);
    return list.sort((a, b) => a.num - b.num);
  }, [spots, currentFloor]);

  const stats = useMemo(() => {
    const occupied = floorSpots.filter((s) => s.occ).length;
    const available = floorSpots.length - occupied;
    return { occupied, available, total: floorSpots.length || 100 };
  }, [floorSpots]);

  const filteredSpots = useMemo(() => {
    if (filterMode === 'FREE') return floorSpots.filter((s) => !s.occ);
    if (filterMode === 'OCCUPIED') return floorSpots.filter((s) => s.occ);
    return floorSpots;
  }, [floorSpots, filterMode]);

  return (
    <div className="panel-card parking-floor-panel">
      {/* Cabecera con selector de plantas (A, B, C, D) */}
      <div className="floor-panel-header">
        <div className="floor-tabs-group">
          {['A', 'B', 'C', 'D'].map((floor) => (
            <button
              key={floor}
              type="button"
              className={`floor-tab-btn ${currentFloor === floor ? 'floor-tab-active' : ''}`}
              onClick={() => handleFloorSelect(floor)}
            >
              <span className="floor-tab-letter">PLANTA {floor}</span>
              <span className="floor-tab-desc">Nivel {floor === 'A' ? '1' : floor === 'B' ? '2' : floor === 'C' ? '3' : '4'}</span>
            </button>
          ))}
        </div>

        {/* Acciones de vista y contadores de aforo del piso */}
        <div className="floor-filter-actions">
          {/* Conmutador de modo de visualización: Plano vs Grilla */}
          <div className="view-mode-toggle-group">
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'PLAN' ? 'view-active' : ''}`}
              onClick={() => setViewMode('PLAN')}
              title="Plano arquitectónico interactivo con rampas y carriles viales"
            >
              🗺️ Plano 2D
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${viewMode === 'GRID' ? 'view-active' : ''}`}
              onClick={() => setViewMode('GRID')}
              title="Grilla matricial de 100 sensores"
            >
              🔢 Grilla 100
            </button>
          </div>

          <span className="floor-quick-stat stat-free">
            🟢 <strong>{stats.available}</strong> Libres
          </span>
          <span className="floor-quick-stat stat-occ">
            🔴 <strong>{stats.occupied}</strong> Ocupados
          </span>

          {viewMode === 'GRID' && (
            <div className="filter-pill-group">
              <button
                type="button"
                className={`filter-pill ${filterMode === 'ALL' ? 'pill-active' : ''}`}
                onClick={() => setFilterMode('ALL')}
              >
                Todos (100)
              </button>
              <button
                type="button"
                className={`filter-pill ${filterMode === 'FREE' ? 'pill-active' : ''}`}
                onClick={() => setFilterMode('FREE')}
              >
                Libres
              </button>
              <button
                type="button"
                className={`filter-pill ${filterMode === 'OCCUPIED' ? 'pill-active' : ''}`}
                onClick={() => setFilterMode('OCCUPIED')}
              >
                Ocupados
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 1. MODO PLANO ARQUITECTÓNICO 2D */}
      {viewMode === 'PLAN' && (
        <ParkingFloorPlan
          floor={currentFloor}
          spots={floorSpots}
          selectedSpot={selectedSpot}
          onSelectSpot={setSelectedSpot}
          isJamActive={isJamActive}
          inTransit={inTransit}
        />
      )}

      {/* 2. MODO GRILLA MATRICIAL DE 100 PUESTOS */}
      {viewMode === 'GRID' && (
        <div className="spots-grid-container">
          {filteredSpots.length === 0 ? (
            <div className="spots-empty-notice" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <span>No hay plazas registradas en este nivel bajo el filtro seleccionado ({filterMode === 'OCCUPIED' ? 'Sin vehículos estacionados' : 'Sin plazas disponibles'}).</span>
            </div>
          ) : (
            <div className="spots-grid">
              {filteredSpots.map((spot) => {
                const isSelected = selectedSpot?.id === spot.id;

                return (
                  <div
                    key={spot.id}
                    className={`spot-cell ${spot.occ ? 'spot-occupied' : 'spot-free'} ${isSelected ? 'spot-selected' : ''}`}
                    onClick={() => setSelectedSpot(spot)}
                    title={`Puesto: ${spot.id} • ${spot.occ ? `Ocupado por ${spot.car} (Entró: ${spot.t_in})` : 'Disponible'}`}
                  >
                    <div className="sensor-led-indicator">
                      <span className={`sensor-light ${spot.occ ? 'sensor-red' : 'sensor-green'}`} />
                    </div>
                    <span className="spot-id-label">{spot.id}</span>
                    <span className="spot-icon">{spot.occ ? '🚗' : '🅿️'}</span>
                    {spot.occ && <span className="spot-plate-tag">{spot.car.split(' ')[0]}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inspector / Popover de Puesto Seleccionado */}
      {selectedSpot && (
        <div className="spot-inspector-card">
          <div className="inspector-header">
            <div className="inspector-title">
              <span className="inspector-badge">{selectedSpot.id}</span>
              <h4>Detalles de Plaza y Sensor</h4>
            </div>
            <button
              type="button"
              className="inspector-close-btn"
              onClick={() => setSelectedSpot(null)}
            >
              ✕
            </button>
          </div>

          <div className="inspector-body">
            <div className="inspector-row">
              <span className="row-label">Estado del Sensor:</span>
              <span className={`row-badge ${selectedSpot.occ ? 'badge-occ' : 'badge-free'}`}>
                {selectedSpot.occ ? '🔴 OCUPADO' : '🟢 DISPONIBLE'}
              </span>
            </div>

            {selectedSpot.occ ? (
              <>
                <div className="inspector-row">
                  <span className="row-label">Vehículo / Patente:</span>
                  <span className="row-value font-mono">{selectedSpot.car || 'Desconocido'}</span>
                </div>
                <div className="inspector-row">
                  <span className="row-label">Hora Exacta de Entrada (T_in):</span>
                  <span className="row-value font-mono highlight-time">{selectedSpot.t_in || '--:--:--'}</span>
                </div>
                <div className="inspector-row">
                  <span className="row-label">Planta y Ubicación:</span>
                  <span className="row-value">Planta {selectedSpot.floor} (Puesto {selectedSpot.num})</span>
                </div>
              </>
            ) : (
              <div className="spot-available-notice">
                <span>Plaza libre lista para asignación a vehículos entrantes.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default ParkingFloorMap;
