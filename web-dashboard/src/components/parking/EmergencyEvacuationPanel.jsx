import React from 'react';

/**
 * EmergencyEvacuationPanel
 * Protocolo de Evacuación Crítica y Medición de Tiempo de Peor Caso (WCET).
 * Evalúa el cumplimiento estricto de deadlines temporales bajo contingencia.
 */
export const EmergencyEvacuationPanel = React.memo(function EmergencyEvacuationPanel({
  metrics,
  onToggleEmergency,
}) {
  const {
    isEmergencyActive = false,
    criticalDeadlineSec = 180,
    theoreticalWcetSec = 75,
    elapsedSeconds = 0,
    evacuatedCount = 0,
    remainingCount = 140,
    progressPercent = 0,
    deadlineMet = true,
    status = 'EN_PROGRESO',
  } = metrics || {};

  return (
    <div className={`panel-card evacuation-panel ${isEmergencyActive ? 'panel-emergency-active' : ''}`}>
      <div className="evacuation-header">
        <div className="header-title">
          <span className="emergency-icon">{isEmergencyActive ? '🚨' : '🛡️'}</span>
          <div>
            <h3>Protocolo de Evacuación de Emergencia (WCET)</h3>
            <span className="panel-hint">
              {isEmergencyActive
                ? 'SISTEMA CRÍTICO EN CURSO: Medición en tiempo real frente al Deadline reglamentario'
                : 'Verificación de Seguridad en Peor Caso de Ejecución (Worst-Case Execution Time)'}
            </span>
          </div>
        </div>

        <div className="evacuation-actions">
          {isEmergencyActive ? (
            <button
              type="button"
              className="btn btn-reset-emergency"
              onClick={onToggleEmergency}
            >
              ✓ Restablecer Operación Normal
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-alarm-trigger pulse-glow"
              onClick={onToggleEmergency}
            >
              🚨 Activar Evacuación de Emergencia
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Métricas de Tiempo Real y WCET */}
      <div className="wcet-metrics-grid">
        {/* 1. Cronómetro de Evacuación */}
        <div className="wcet-card">
          <span className="wcet-card-label">Tiempo Transcurrido</span>
          <div className="wcet-card-value font-mono">
            <span className={`timer-number ${isEmergencyActive ? 'timer-active' : ''}`}>
              {elapsedSeconds}s
            </span>
            <small className="timer-sub">/ {criticalDeadlineSec}s máx</small>
          </div>
          <span className="wcet-card-hint">Cronómetro de contingencia</span>
        </div>

        {/* 2. WCET Teórico vs Real */}
        <div className="wcet-card">
          <span className="wcet-card-label">WCET Estimado</span>
          <div className="wcet-card-value font-mono highlight-wcet">
            <span>{theoreticalWcetSec}s</span>
          </div>
          <span className="wcet-card-hint">Peor caso de descarga analítico</span>
        </div>

        {/* 3. Vehículos Evacuados */}
        <div className="wcet-card">
          <span className="wcet-card-label">Vehículos Evacuados</span>
          <div className="wcet-card-value font-mono" style={{ color: '#10b981' }}>
            <span>{evacuatedCount}</span>
            <small className="timer-sub">/ {evacuatedCount + remainingCount} total</small>
          </div>
          <span className="wcet-card-hint">
            {remainingCount > 0 ? `${remainingCount} restantes en plantas` : '¡Edificio 100% despejado!'}
          </span>
        </div>

        {/* 4. Veredicto de Deadline */}
        <div className="wcet-card">
          <span className="wcet-card-label">Veredicto SDTR</span>
          <div className="wcet-card-verdict">
            <span className={`verdict-pill ${deadlineMet ? 'verdict-pass' : 'verdict-fail'}`}>
              {status === 'COMPLETADA'
                ? '✓ WCET CUMPLIDO'
                : deadlineMet
                  ? 'EN MARGEN SEGURO'
                  : '⚠️ DEADLINE SUPERADO'}
            </span>
          </div>
          <span className="wcet-card-hint">
            {deadlineMet ? 'Dentro del margen admisible' : 'Retardo crítico'}
          </span>
        </div>
      </div>

      {/* Barra de Progreso de Evacuación */}
      <div className="evacuation-progress-section">
        <div className="progress-label-row">
          <span>Progreso de Evacuación Vehicular:</span>
          <strong>{progressPercent}%</strong>
        </div>
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ${status === 'COMPLETADA' ? 'progress-done' : isEmergencyActive ? 'progress-active' : ''}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
});

export default EmergencyEvacuationPanel;

