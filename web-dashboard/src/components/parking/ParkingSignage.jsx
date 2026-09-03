import React from 'react';

/**
 * Componente de Cartel LED de Aforo Individual (Estilo Display Digital de Estacionamiento)
 * Muestra flecha roja para lugares ocupados y flecha verde para lugares disponibles con número a cada lado.
 */
function LedSignboard({ title, subtitle, occupied, available, total = 100, isGeneral = false }) {
  const occupancyPercent = Math.min(100, Math.round((occupied / total) * 100));

  return (
    <div className={`led-signboard ${isGeneral ? 'led-signboard-general' : ''}`}>
      <div className="signboard-header">
        <div className="signboard-title-group">
          <span className="signboard-icon">{isGeneral ? '🏢' : '🅿️'}</span>
          <div>
            <h4 className="signboard-title">{title}</h4>
            {subtitle && <span className="signboard-subtitle">{subtitle}</span>}
          </div>
        </div>
        <span className="signboard-total-tag">Cap: {total}</span>
      </div>

      {/* Panel digital LED con flecha roja (ocupados) y verde (disponibles) */}
      <div className="led-display-panel">
        {/* Lado izquierdo: Ocupados con flecha roja */}
        <div className="led-zone led-occupied-zone">
          <span className="led-arrow led-arrow-red">⬅️</span>
          <div className="led-counter-group">
            <span className="led-number led-number-red">{occupied}</span>
            <span className="led-label">OCUPADOS</span>
          </div>
        </div>

        {/* Divisor central de status */}
        <div className="led-divider">
          <span className={`led-status-pill ${occupancyPercent >= 90 ? 'status-full' : 'status-open'}`}>
            {occupancyPercent >= 100 ? 'COMPLETO' : occupancyPercent >= 90 ? 'CASI LLENO' : 'ABIERTO'}
          </span>
        </div>

        {/* Lado derecho: Disponibles con flecha verde */}
        <div className="led-zone led-available-zone">
          <div className="led-counter-group led-counter-right">
            <span className="led-number led-number-green">{available}</span>
            <span className="led-label">LIBRES</span>
          </div>
          <span className="led-arrow led-arrow-green">➡️</span>
        </div>
      </div>

      {/* Barra de progreso de llenado */}
      <div className="signboard-bar-track">
        <div
          className={`signboard-bar-fill ${
            occupancyPercent >= 85 ? 'bar-danger' : occupancyPercent >= 60 ? 'bar-warning' : 'bar-normal'
          }`}
          style={{ width: `${occupancyPercent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * ParkingSignage
 * Módulo de Cartelería Digital de Aforo para el Estacionamiento:
 * - 1 Cartel de Aforo General (Totem Principal para las 400 plazas).
 * - 4 Carteles de Planta (Plantas A, B, C, D de 100 plazas cada una).
 */
export const ParkingSignage = React.memo(function ParkingSignage({
  totalOccupied = 0,
  totalAvailable = 400,
  totalSpots = 400,
  floors = [],
}) {
  const defaultFloors = [
    { floor: 'A', name: 'Planta A (Nivel 1)', occupied: 0, available: 100, total: 100 },
    { floor: 'B', name: 'Planta B (Nivel 2)', occupied: 0, available: 100, total: 100 },
    { floor: 'C', name: 'Planta C (Nivel 3)', occupied: 0, available: 100, total: 100 },
    { floor: 'D', name: 'Planta D (Nivel 4)', occupied: 0, available: 100, total: 100 },
  ];

  const mergedFloors = defaultFloors.map((df) => {
    const live = floors.find((f) => f.floor === df.floor);
    return live ? { ...df, occupied: live.occupied, available: live.available } : df;
  });

  return (
    <div className="parking-signage-container">
      {/* 1. Cartel General de Aforo (Tótem Central) */}
      <div className="signage-general-wrapper">
        <LedSignboard
          title="AFORO GENERAL DEL ESTACIONAMIENTO"
          subtitle="Tótem de Acceso Principal • 4 Plantas"
          occupied={totalOccupied}
          available={totalAvailable}
          total={totalSpots}
          isGeneral={true}
        />
      </div>

      {/* 2. Carteles de Aforo por Piso (Plantas A, B, C, D) */}
      <div className="signage-floors-grid">
        {mergedFloors.map((f) => (
          <LedSignboard
            key={f.floor}
            title={`PLANTA ${f.floor}`}
            subtitle={f.name}
            occupied={f.occupied}
            available={f.available}
            total={f.total}
            isGeneral={false}
          />
        ))}
      </div>
    </div>
  );
});

export default ParkingSignage;

