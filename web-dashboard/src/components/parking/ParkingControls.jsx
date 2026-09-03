import React from 'react';

/**
 * ParkingControls
 * Panel de comando para controlar la simulación del Estacionamiento Inteligente.
 */
export const ParkingControls = React.memo(function ParkingControls({
  isPlaying = false,
  onPlay,
  onPause,
  onStep,
  arrivalRate = 0.5,
  onRateChange,
  onSpawnManual,
  disabled = false,
}) {
  return (
    <div className="panel-card simulation-controls-panel parking-controls-bar">
      <div className="controls-top-row">
        {/* Botones de comando */}
        <div className="action-buttons-group">
          <button
            type="button"
            className={`btn btn-primary ${isPlaying ? 'btn-pulse-glow' : ''}`}
            onClick={onPlay}
            disabled={disabled}
          >
            <span className="btn-icon">▶</span>
            <span>{isPlaying ? 'En Ejecución' : 'Iniciar'}</span>
          </button>

          <button
            type="button"
            className="btn btn-warning"
            onClick={onPause}
            disabled={disabled}
          >
            <span className="btn-icon">⏸</span>
            <span>Pausar</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onStep}
            disabled={disabled}
          >
            <span className="btn-icon">⏭</span>
            <span>Paso (Step)</span>
          </button>

          <button
            type="button"
            className="btn btn-accent"
            onClick={onSpawnManual}
            disabled={disabled}
          >
            <span className="btn-icon">🚗</span>
            <span>Ingreso Manual de Auto</span>
          </button>
        </div>

        {/* Control deslizante de tasa de entrada */}
        <div className="arrival-rate-control">
          <span className="rate-label">Tasa de Ingreso Vehicular:</span>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={arrivalRate}
            onChange={(e) => onRateChange && onRateChange(Number(e.target.value))}
            className="rate-slider"
          />
          <span className="rate-value-pill">
            {Math.round(arrivalRate * 60)} autos / min
          </span>
        </div>
      </div>
    </div>
  );
});

export default ParkingControls;
