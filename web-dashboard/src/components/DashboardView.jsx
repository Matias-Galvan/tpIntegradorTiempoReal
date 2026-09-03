import React, { useMemo } from 'react';
import TrafficMap from './TrafficMap';

/**
 * Subcomponente memoizado para tarjetas de métricas individuales.
 * Previene re-renders innecesarios cuando otras métricas cambian.
 */
const MetricCard = React.memo(function MetricCard({
  title,
  value,
  unit = '',
  subtitle,
  icon,
  badgeText,
  badgeColor,
}) {
  return (
    <div className="metric-card">
      <div className="metric-header">
        <span className="metric-title">{title}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <div className="metric-body">
        <span className="metric-value">{value}</span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
      {(subtitle || badgeText) && (
        <div className="metric-footer">
          {badgeText && (
            <span
              className="metric-badge"
              style={{
                backgroundColor: badgeColor?.bg || 'rgba(16, 185, 129, 0.15)',
                color: badgeColor?.text || '#10b981',
                borderColor: badgeColor?.border || 'rgba(16, 185, 129, 0.3)',
              }}
            >
              {badgeText}
            </span>
          )}
          {subtitle && <span className="metric-subtitle">{subtitle}</span>}
        </div>
      )}
    </div>
  );
});

/**
 * Mapeo de niveles de congestión a etiquetas y colores UI
 */
const CONGESTION_CONFIG = {
  FLUID: {
    label: 'Fluido (Tráfico Libre)',
    bg: 'rgba(34, 197, 94, 0.15)',
    text: '#22c55e',
    border: 'rgba(34, 197, 94, 0.35)',
    barColor: '#22c55e',
    percentage: 25,
  },
  MODERATE: {
    label: 'Moderado (Flujo Estable)',
    bg: 'rgba(234, 179, 8, 0.15)',
    text: '#eab308',
    border: 'rgba(234, 179, 8, 0.35)',
    barColor: '#eab308',
    percentage: 55,
  },
  CONGESTED: {
    label: 'Denso / Congestionado',
    bg: 'rgba(249, 115, 22, 0.15)',
    text: '#f97316',
    border: 'rgba(249, 115, 22, 0.35)',
    barColor: '#f97316',
    percentage: 80,
  },
  CRITICAL: {
    label: 'Crítico (Embotellamiento)',
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#ef4444',
    border: 'rgba(239, 68, 68, 0.35)',
    barColor: '#ef4444',
    percentage: 98,
  },
};

/**
 * DashboardView
 * Tablero de visualización de telemetría en tiempo real recibida de GAMA Platform.
 */
export const DashboardView = React.memo(function DashboardView({
  simulationData,
  isConnected,
  connectionState,
}) {
  const {
    currentHour = 8,
    trafficFlow = 0,
    activeVehicles = 0,
    congestionLevel = 'FLUID',
    roadDensities = [],
    cycle = 0,
    lastUpdated,
  } = simulationData || {};

  // Normalizar el estado de congestión
  const congestionInfo = useMemo(() => {
    const key = String(congestionLevel).toUpperCase();
    return CONGESTION_CONFIG[key] || CONGESTION_CONFIG.FLUID;
  }, [congestionLevel]);

  // Formato de hora HH:00
  const formattedHour = useMemo(() => {
    return `${String(currentHour).padStart(2, '0')}:00`;
  }, [currentHour]);

  // Formato de última actualización
  const formattedTimestamp = useMemo(() => {
    if (!lastUpdated) return 'Esperando flujo de datos...';
    const date = new Date(lastUpdated);
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdated]);

  return (
    <div className="dashboard-container">
      {/* Banner de estado de conectividad en tiempo real */}
      <div className={`connection-banner ${isConnected ? 'status-ok' : 'status-alert'}`}>
        <div className="banner-info">
          <span className="pulsing-dot" />
          <span className="banner-text">
            <strong>GAMA Server:</strong>{' '}
            {isConnected
              ? 'Conexión activa (ws://localhost:6868) - Recibiendo telemetría en vivo'
              : connectionState === 'RECONNECTING'
              ? 'Reintentando conexión con backoff exponencial...'
              : 'Servidor desconectado. Verifique que GAMA Server esté ejecutándose.'}
          </span>
        </div>
        <div className="banner-meta">
          <span>Ciclo: <strong>#{cycle}</strong></span>
          <span className="separator">•</span>
          <span>Sync: <strong>{formattedTimestamp}</strong></span>
        </div>
      </div>

      {/* Grid de KPIs principales */}
      <div className="metrics-grid">
        <MetricCard
          title="Aforo de Tráfico"
          value={Number(trafficFlow).toLocaleString()}
          unit="veh/h"
          subtitle="Flujo estimado en la red"
          icon="🚗"
          badgeText="Telemetría"
        />

        <MetricCard
          title="Vehículos Activos"
          value={Number(activeVehicles).toLocaleString()}
          unit="agentes"
          subtitle="Agentes en circulación"
          icon="🚦"
          badgeText={`${activeVehicles > 0 ? 'En Tránsito' : 'Inactivo'}`}
          badgeColor={{
            bg: activeVehicles > 0 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(107, 114, 128, 0.15)',
            text: activeVehicles > 0 ? '#3b82f6' : '#9ca3af',
            border: activeVehicles > 0 ? 'rgba(59, 130, 246, 0.3)' : 'rgba(107, 114, 128, 0.3)',
          }}
        />

        <MetricCard
          title="Hora Simulada"
          value={formattedHour}
          unit="hs"
          subtitle="Ciclo diurno / nocturno"
          icon="🕒"
          badgeText={currentHour >= 7 && currentHour <= 19 ? 'Diurno' : 'Nocturno'}
          badgeColor={{
            bg: 'rgba(168, 85, 247, 0.15)',
            text: '#a855f7',
            border: 'rgba(168, 85, 247, 0.3)',
          }}
        />

        <MetricCard
          title="Nivel de Congestión"
          value={congestionInfo.label.split(' ')[0]}
          subtitle={congestionInfo.label}
          icon="📈"
          badgeText={`${congestionInfo.percentage}% Cap.`}
          badgeColor={congestionInfo}
        />
      </div>

      {/* Mapa Interactivo de Arterias y Densidad Vial */}
      <TrafficMap
        roadDensities={roadDensities}
        activeVehicles={activeVehicles}
        congestionLevel={congestionLevel}
      />

      {/* Visualización de Densidad y Capacidad Vial */}
      <div className="panel-card traffic-density-panel">
        <div className="panel-header">
          <div className="header-title">
            <span>📊</span>
            <h3>Densidad y Saturación de Arterias (Road Traffic Model)</h3>
          </div>
          <span className="panel-hint">Capacidad dinámica de la red vial</span>
        </div>

        <div className="density-overview">
          <div className="congestion-bar-container">
            <div className="bar-label-group">
              <span className="bar-title">Índice Global de Congestión:</span>
              <span className="bar-status-text" style={{ color: congestionInfo.text }}>
                {congestionInfo.label}
              </span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${congestionInfo.percentage}%`,
                  backgroundColor: congestionInfo.barColor,
                }}
              />
            </div>
          </div>

          {/* Tramos o arterias individuales si son provistos por GAMA */}
          {Array.isArray(roadDensities) && roadDensities.length > 0 ? (
            <div className="roads-list">
              <h4 className="roads-title">Tramos Monitoreados en Tiempo Real:</h4>
              <div className="roads-grid">
                {roadDensities.map((road, idx) => {
                  const roadName = road.name || road.id || `Tramo #${idx + 1}`;
                  const density = Math.min(100, Math.max(0, road.density ?? road.congestion ?? 0));
                  const isHigh = density > 75;
                  const isMed = density > 45 && density <= 75;
                  const color = isHigh ? '#ef4444' : isMed ? '#f97316' : '#22c55e';

                  return (
                    <div key={road.id || idx} className="road-item">
                      <div className="road-header">
                        <span className="road-name">{roadName}</span>
                        <span className="road-value" style={{ color }}>
                          {Math.round(density)}%
                        </span>
                      </div>
                      <div className="road-progress-track">
                        <div
                          className="road-progress-fill"
                          style={{ width: `${density}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="empty-roads-notice">
              <span>🛣️</span>
              <p>
                A la espera de telemetría detallada de tramos desde el modelo GAML (RoadTrafficModel_step1).
                Las métricas globales se están procesando activamente.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default DashboardView;

