import React from 'react';

/**
 * InternalTrafficMonitor
 * Monitoreo en tiempo real del tráfico interno del estacionamiento:
 * - Flujo vehicular en rampas de conexión inter-planta y pasillos principales.
 * - Detectores automáticos de atascamiento (Jam Detection) con alertas acústico-visuales.
 */
export const InternalTrafficMonitor = React.memo(function InternalTrafficMonitor({
  corridors = [],
  inTransit = 0,
  onTriggerJam,
  onClearJam,
  isJamActive = false,
}) {
  const defaultCorridors = [
    { id: 'RAMP_A_B', name: 'Rampa Planta A -> B', is_ramp: true, capacity: 8, vehicles: 1, density: 12, is_jammed: false },
    { id: 'RAMP_B_C', name: 'Rampa Planta B -> C', is_ramp: true, capacity: 8, vehicles: 0, density: 0, is_jammed: false },
    { id: 'RAMP_C_D', name: 'Rampa Planta C -> D', is_ramp: true, capacity: 8, vehicles: 0, density: 0, is_jammed: false },
    { id: 'AISLE_A', name: 'Pasillo Principal Planta A', is_ramp: false, capacity: 14, vehicles: 2, density: 14, is_jammed: false },
    { id: 'AISLE_B', name: 'Pasillo Principal Planta B', is_ramp: false, capacity: 14, vehicles: 1, density: 7, is_jammed: false },
    { id: 'AISLE_C', name: 'Pasillo Principal Planta C', is_ramp: false, capacity: 14, vehicles: 1, density: 7, is_jammed: false },
    { id: 'AISLE_D', name: 'Pasillo Principal Planta D', is_ramp: false, capacity: 14, vehicles: 0, density: 0, is_jammed: false },
  ];

  const list = corridors.length > 0 ? corridors : defaultCorridors;
  const jammedList = list.filter((c) => c.is_jammed || c.density >= 75);

  return (
    <div className="panel-card internal-traffic-panel">
      <div className="panel-header">
        <div className="header-title">
          <span className="control-icon">🚦</span>
          <div>
            <h3>Tráfico Interno y Detección de Atascamientos</h3>
            <span className="panel-hint">
              {inTransit} vehículos circulando entre plantas y rampas
            </span>
          </div>
        </div>

        {/* Acciones de prueba para simular / despejar atascamiento */}
        <div className="traffic-actions-group">
          {isJamActive || jammedList.length > 0 ? (
            <button
              type="button"
              className="btn btn-clear-jam"
              onClick={onClearJam}
            >
              ✓ Despejar Atascamiento
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-trigger-jam"
              onClick={() => onTriggerJam && onTriggerJam('RAMP_A_B')}
            >
              ⚠️ Simular Atascamiento en Rampa
            </button>
          )}
        </div>
      </div>

      {/* Banner de alerta crítica si hay algún atascamiento detectado */}
      {(isJamActive || jammedList.length > 0) && (
        <div className="jam-alert-banner">
          <div className="jam-alert-icon">⚠️</div>
          <div className="jam-alert-text">
            <strong>ALERTA DE ATASCAMIENTO INTERNO (SDTR):</strong>
            <span>
              {jammedList.length > 0
                ? `Cuello de botella detectado en: ${jammedList.map((j) => j.name).join(', ')}. Vehículos detenidos.`
                : 'Atascamiento inducido en rampas de acceso. El flujo hacia las plantas superiores se encuentra demorado.'}
            </span>
          </div>
        </div>
      )}

      {/* Grilla de tramos internos (rampas y pasillos) */}
      <div className="corridors-grid">
        {list.map((corridor) => {
          const density = Math.min(100, Math.max(0, corridor.density || 0));
          const isJammed = corridor.is_jammed || density >= 75;

          const colorClass = isJammed
            ? 'corridor-danger'
            : density >= 50
            ? 'corridor-warning'
            : 'corridor-ok';

          return (
            <div key={corridor.id} className={`corridor-card ${colorClass}`}>
              <div className="corridor-card-header">
                <div className="corridor-title-group">
                  <span className="corridor-icon">{corridor.is_ramp ? '🪜' : '🚗'}</span>
                  <span className="corridor-name">{corridor.name}</span>
                </div>
                <span className={`corridor-status-tag ${isJammed ? 'tag-jammed' : 'tag-fluid'}`}>
                  {isJammed ? 'ATASCADO' : `${density}% Flujo`}
                </span>
              </div>

              <div className="corridor-stats">
                <span className="corridor-stat-label">En circulación:</span>
                <span className="corridor-stat-val">
                  {corridor.vehicles || 0} / {corridor.capacity} veh
                </span>
              </div>

              <div className="corridor-progress-track">
                <div
                  className={`corridor-progress-bar ${colorClass}`}
                  style={{ width: `${density}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default InternalTrafficMonitor;

