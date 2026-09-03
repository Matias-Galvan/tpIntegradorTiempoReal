import React, { useState, useEffect, useRef, useCallback } from 'react';

/**
 * SimulationControls
 * Componente de control para la simulación de tráfico multi-agente en GAMA.
 *
 * Características:
 * - Botones de acción: Iniciar (Play), Pausar (Pause), Paso a paso (Step).
 * - Slider interactivo (0 a 23 hs) para controlar la hora del día y simular hora pico.
 * - Throttling / Debouncing híbrido (~120ms): Mantiene feedback visual fluido a 60fps
 *   en el navegador, pero limita los despachos de red por WebSocket para evitar
 *   congestión del canal de control.
 */
export const SimulationControls = React.memo(function SimulationControls({
  isConnected,
  currentHour = 8,
  onPlay,
  onPause,
  onStep,
  onSetHour,
}) {
  // Estado local para respuesta visual inmediata y sin lag
  const [localHour, setLocalHour] = useState(currentHour);

  // Referencias para el control de tiempo de throttling/debouncing
  const timeoutRef = useRef(null);
  const lastEmitTimeRef = useRef(0);
  const latestHourRef = useRef(currentHour);

  const isDraggingRef = useRef(false);
  const dragReleaseTimerRef = useRef(null);

  // Sincronizar el estado local si la hora externa cambia y NO estamos arrastrando
  useEffect(() => {
    if (!isDraggingRef.current && typeof currentHour === 'number' && currentHour >= 0 && currentHour <= 23) {
      setLocalHour(currentHour);
    }
  }, [currentHour]);

  /**
   * Despacho con limitador de tasa (Rate Limiter ~120ms)
   */
  const throttledSetHour = useCallback(
    (hour) => {
      latestHourRef.current = hour;
      const now = performance.now();
      const interval = 120; // Ventana de 120ms

      const emit = () => {
        lastEmitTimeRef.current = performance.now();
        if (onSetHour) {
          onSetHour(latestHourRef.current);
        }
      };

      const elapsed = now - lastEmitTimeRef.current;

      if (elapsed >= interval) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        emit();
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          timeoutRef.current = null;
          emit();
        }, interval - elapsed);
      }
    },
    [onSetHour]
  );

  // Limpieza del temporizador al desmontar
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (dragReleaseTimerRef.current) clearTimeout(dragReleaseTimerRef.current);
    };
  }, []);

  const handleSliderChange = (e) => {
    const value = parseInt(e.target.value, 10);
    isDraggingRef.current = true;
    if (dragReleaseTimerRef.current) clearTimeout(dragReleaseTimerRef.current);

    setLocalHour(value);
    throttledSetHour(value);
  };

  const handleSliderRelease = () => {
    // Al soltar el slider, esperar 500ms antes de permitir que la telemetría remota pise la hora local
    if (dragReleaseTimerRef.current) clearTimeout(dragReleaseTimerRef.current);
    dragReleaseTimerRef.current = setTimeout(() => {
      isDraggingRef.current = false;
    }, 500);
  };

  const getPeakDescription = (hour) => {
    if (hour >= 7 && hour <= 9) return 'Pico Mañana (Ingreso Laboral)';
    if (hour >= 12 && hour <= 14) return 'Tráfico Mediodía (Almuerzo)';
    if (hour >= 17 && hour <= 19) return 'Pico Tarde (Retorno a Hogares)';
    if (hour >= 23 || hour <= 5) return 'Horario Nocturno (Flujo Mínimo)';
    return 'Flujo Valle Regular';
  };

  return (
    <div className="panel-card simulation-controls">
      <div className="panel-header">
        <div className="header-title">
          <span className="control-icon">⚙️</span>
          <h3>Centro de Control de Simulación</h3>
        </div>
        <span className={`status-pill ${isConnected ? 'online' : 'offline'}`}>
          {isConnected ? 'CANAL ACTIVO' : 'DESCONECTADO'}
        </span>
      </div>

      <div className="controls-grid">
        {/* Botones de acción principales */}
        <div className="action-buttons-group">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPlay}
            disabled={!isConnected}
            title="Iniciar o reanudar el ciclo de simulación en GAMA"
          >
            <span className="btn-icon">▶</span>
            <span>Iniciar</span>
          </button>

          <button
            type="button"
            className="btn btn-warning"
            onClick={onPause}
            disabled={!isConnected}
            title="Pausar la simulación en el estado actual"
          >
            <span className="btn-icon">⏸</span>
            <span>Pausar</span>
          </button>

          {onStep && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onStep}
              disabled={!isConnected}
              title="Avanzar un ciclo discreto de simulación"
            >
              <span className="btn-icon">⏭</span>
              <span>Paso (Step)</span>
            </button>
          )}
        </div>

        {/* Slider de control horario con feedback en tiempo real */}
        <div className="slider-container">
          <div className="slider-labels">
            <label htmlFor="hour-range-slider" className="slider-title">
              Hora Simulada del Día:
            </label>
            <div className="slider-badge">
              <span className="time-display">
                {String(localHour).padStart(2, '0')}:00 hs
              </span>
              <span className="peak-legend">({getPeakDescription(localHour)})</span>
            </div>
          </div>

          <div className="range-track-wrapper">
            <input
              id="hour-range-slider"
              type="range"
              min="0"
              max="23"
              step="1"
              value={localHour}
              onChange={handleSliderChange}
              onMouseUp={handleSliderRelease}
              onTouchEnd={handleSliderRelease}
              onKeyUp={handleSliderRelease}
              disabled={!isConnected}
              className="custom-range-slider"
            />
          </div>

          {/* Marcadores de referencia horaria */}
          <div className="slider-ticks">
            <span className="tick-label">00:00</span>
            <span className="tick-label highlight">08:00 (Pico)</span>
            <span className="tick-label">12:00</span>
            <span className="tick-label highlight">18:00 (Pico)</span>
            <span className="tick-label">23:00</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default SimulationControls;
