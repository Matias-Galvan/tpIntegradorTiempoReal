import React from 'react';

/**
 * RampMutexIndicator
 * Monitor de Exclusión Mutua (Mutex) y Prevención de Deadlocks en Rampas de Interconexión.
 * Aplica principios de sincronización de procesos de tiempo real para recursos compartidos.
 */
export const RampMutexIndicator = React.memo(function RampMutexIndicator({
  mutexes = [],
  isEmergency = false,
}) {
  return (
    <div className="panel-card ramp-mutex-panel">
      <div className="panel-header">
        <div className="header-title">
          <span className="control-icon">🚦</span>
          <div>
            <h3>Control de Concurrencia en Rampas (Semáforos Mutex)</h3>
            <span className="panel-hint">
              {isEmergency
                ? '🚨 OVERRIDE DE EMERGENCIA: Todas las rampas forzadas a descenso exclusivo'
                : 'Prevención de Deadlock mediante Exclusión Mutua y Alternancia Libre de Inanición'}
            </span>
          </div>
        </div>

        <div className="mutex-badge-status">
          <span className={`status-pill ${isEmergency ? 'pill-emergency' : 'pill-mutex-ok'}`}>
            {isEmergency ? '⚠️ OVERRIDE DE SEGURIDAD' : '🔒 EXCLUSIÓN MUTUA ACTIVA'}
          </span>
        </div>
      </div>

      <div className="ramp-mutex-cards-grid">
        {mutexes.map((ramp) => {
          const isUp = ramp.state === 'UP';
          const isDown = ramp.state === 'DOWN';
          const isClearing = ramp.state === 'CLEARING';

          return (
            <div
              key={ramp.id}
              className={`mutex-ramp-card ${isEmergency ? 'card-emergency' : ''} ${ramp.isDeadlockRisk ? 'card-risk' : ''}`}
            >
              <div className="mutex-card-header">
                <span className="ramp-name">{ramp.name}</span>
                <span className="ramp-active-count">
                  🚗 <strong>{ramp.activeVehicles}</strong> en tránsito
                </span>
              </div>

              {/* Semáforo vial bidireccional */}
              <div className="mutex-traffic-signals">
                {/* Lado Ascenso */}
                <div className={`signal-box ${isUp ? 'signal-green' : 'signal-red'}`}>
                  <span className="signal-arrow">▲</span>
                  <span className="signal-state">{isUp ? 'ASCENSO HABILITADO' : 'DETENIDO'}</span>
                  <span className="signal-queue">Cola: {ramp.waitingUp} autos</span>
                </div>

                {/* Fase central / Timer de despeje */}
                <div className="signal-clearing-box">
                  {isClearing ? (
                    <div className="clearing-warning pulse-glow">
                      <span>⚠️ VACIANDO</span>
                      <small>{ramp.directionTimer}s</small>
                    </div>
                  ) : (
                    <div className="phase-timer-indicator">
                      <span className="phase-label">Fase:</span>
                      <span className="phase-seconds">{ramp.directionTimer}s</span>
                    </div>
                  )}
                </div>

                {/* Lado Descenso */}
                <div className={`signal-box ${isDown ? 'signal-green' : 'signal-red'}`}>
                  <span className="signal-arrow">▼</span>
                  <span className="signal-state">{isDown ? 'DESCENSO HABILITADO' : 'DETENIDO'}</span>
                  <span className="signal-queue">Cola: {ramp.waitingDown} autos</span>
                </div>
              </div>

              {/* Barra de progreso de fase */}
              <div className="mutex-phase-bar-track">
                <div
                  className={`mutex-phase-bar-fill ${isClearing ? 'fill-yellow' : isUp ? 'fill-blue' : 'fill-green'}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, (ramp.directionTimer / ramp.maxPhaseSeconds) * 100))}%`,
                  }}
                />
              </div>

              {ramp.isDeadlockRisk && !isEmergency && (
                <div className="deadlock-risk-alert">
                  <span>⚠️ Alto tráfico bilateral. Algoritmo balanceando turnos sin inanición.</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default RampMutexIndicator;

