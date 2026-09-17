import React, { useState, useEffect, useMemo } from 'react';
import { notificationService, NotificationSeverity, NotificationType } from '../../services/notificationService';

/**
 * ParkingNotificationCenter
 * Pantalla de Auditoría en Tiempo Real, Bitácora de Eventos y Centro de Notificaciones Push (WhatsApp API)
 */
export const ParkingNotificationCenter = React.memo(function ParkingNotificationCenter({
  floors = [],
  totalOccupied = 0,
  totalSpots = 400,
  isEmergency = false,
  onBackToMap,
}) {
  const [history, setHistory] = useState([]);
  const [config, setConfig] = useState(notificationService.getConfig());
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [inspectedPayload, setInspectedPayload] = useState(null);
  const [feedbackToast, setFeedbackToast] = useState(null);

  // Suscripción al servicio de notificaciones
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((newHistory, newConfig) => {
      setHistory(newHistory);
      setConfig(newConfig);
    });
    return () => unsubscribe();
  }, []);

  // Mostrar toast temporal de feedback
  const showToast = (text) => {
    setFeedbackToast(text);
    setTimeout(() => setFeedbackToast(null), 3500);
  };

  // Manejo de prueba de WhatsApp
  const handleTestPush = () => {
    const item = notificationService.testPushNotification();
    showToast(`✓ Alerta enviada a WhatsApp (${config.targetPhone})`);
    if (item.pushStatus) {
      setInspectedPayload(item.pushStatus);
    }
  };

  // Limpiar historial
  const handleClear = () => {
    if (window.confirm('¿Desea vaciar el historial de notificaciones y eventos?')) {
      notificationService.clearHistory();
      showToast('Historial vaciado correctamente.');
    }
  };

  // Filtrado de eventos
  const filteredEvents = useMemo(() => {
    return history.filter((ev) => {
      // Filtro por categoría
      if (activeFilter === 'ENTRY' && ev.type !== NotificationType.ENTRY) return false;
      if (activeFilter === 'EXIT' && ev.type !== NotificationType.EXIT) return false;
      if (
        activeFilter === 'ALERTS' &&
        ev.type !== NotificationType.FLOOR_FULL &&
        ev.type !== NotificationType.CAPACITY_WARNING &&
        ev.type !== NotificationType.RAMP_JAM &&
        ev.type !== NotificationType.EMERGENCY_EVACUATION
      ) {
        return false;
      }
      if (activeFilter === 'PUSH' && !ev.pushStatus) return false;

      // Filtro por texto de búsqueda (patente, plaza, texto)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inTitle = ev.title?.toLowerCase().includes(query);
        const inMessage = ev.message?.toLowerCase().includes(query);
        const inPlate = ev.metadata?.vehicleId?.toLowerCase().includes(query);
        const inSpot = ev.metadata?.spotId?.toLowerCase().includes(query);
        const inFloor = ev.metadata?.floor?.toLowerCase().includes(query);

        return inTitle || inMessage || inPlate || inSpot || inFloor;
      }

      return true;
    });
  }, [history, activeFilter, searchQuery]);

  // Contadores de métricas
  const stats = useMemo(() => {
    const total = history.length;
    const entries = history.filter((h) => h.type === NotificationType.ENTRY).length;
    const exits = history.filter((h) => h.type === NotificationType.EXIT).length;
    const critical = history.filter((h) => h.severity === NotificationSeverity.CRITICAL).length;
    const pushCount = history.filter((h) => h.pushStatus).length;
    return { total, entries, exits, critical, pushCount };
  }, [history]);

  return (
    <div className="notification-center-container">
      {/* Toast flotante */}
      {feedbackToast && (
        <div className="notif-floating-toast">
          <span>🔔 {feedbackToast}</span>
        </div>
      )}

      {/* Barra superior de navegación y acciones */}
      <div className="notif-header-bar">
        <div className="notif-header-title-group">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onBackToMap}
            title="Regresar a la visualización del plano"
          >
            ← Volver al Plano 2D
          </button>
          <div>
            <h2 className="notif-title">
              🔔 Centro de Notificaciones & Auditoría en Tiempo Real
            </h2>
            <p className="notif-subtitle">
              Aforo General: <strong>{totalOccupied} / {totalSpots}</strong> ({Math.round((totalOccupied / Math.max(1, totalSpots)) * 100)}%)
              {isEmergency && <span style={{ color: '#ef4444', fontWeight: 'bold', marginLeft: '8px' }}>• 🚨 PROTOCOLO DE EVACUACIÓN ACTIVO</span>}
              {' '}• Registro inmutable de ingresos, egresos, alertas de planta completa y pasarela WhatsApp Push
            </p>
          </div>
        </div>

        <div className="notif-actions-group">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={handleTestPush}
            title="Enviar mensaje de prueba simulando WhatsApp Cloud API"
          >
            <span style={{ color: '#25D366', fontWeight: 'bold' }}>💬</span> Probar WhatsApp Push
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsConfigModalOpen(true)}
            title="Configurar pasarela de WhatsApp y reglas de alertas"
          >
            ⚙️ Ajustes WhatsApp
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleClear}
            title="Vaciar registro de eventos"
          >
            🗑️ Limpiar
          </button>
        </div>
      </div>

      {/* Monitoreo en Vivo de Plantas Completas (Detección de Aforo 100%) */}
      <div className="notif-floors-monitor-grid">
        {floors.map((fl) => {
          const occ = fl.occupied || 0;
          const total = fl.total || 100;
          const pct = Math.round((occ / total) * 100);
          const isFull = pct >= 100;
          const isHigh = pct >= 90 && !isFull;

          return (
            <div
              key={fl.floor}
              className={`notif-floor-card ${isFull ? 'floor-full-alert' : isHigh ? 'floor-high-alert' : ''}`}
            >
              <div className="floor-card-head">
                <span className="floor-badge">Planta {fl.floor}</span>
                <span className={`floor-status-badge ${isFull ? 'status-critical' : isHigh ? 'status-warning' : 'status-normal'}`}>
                  {isFull ? '🚨 COMPLETA (100%)' : isHigh ? '⚠️ CUASI LLENA' : '✓ OPERATIVA'}
                </span>
              </div>

              <div className="floor-occupancy-info">
                <div className="occupancy-numbers">
                  <span className="number-large">{occ}</span>
                  <span className="number-denom">/ {total} plazas</span>
                </div>
                <span className="occupancy-pct">{pct}%</span>
              </div>

              <div className="floor-progress-track">
                <div
                  className={`floor-progress-bar ${isFull ? 'bg-danger' : isHigh ? 'bg-warning' : 'bg-success'}`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>

              {isFull && (
                <div className="floor-auto-action-msg">
                  <span>⚡ Desvío predictivo SDTR activo hacia otras plantas</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tarjetas de Métricas Resumen */}
      <div className="notif-kpi-row">
        <div className="notif-kpi-pill">
          <span className="kpi-label">Total Registros</span>
          <span className="kpi-value">{stats.total}</span>
        </div>
        <div className="notif-kpi-pill">
          <span className="kpi-label">Ingresos Registrados</span>
          <span className="kpi-value" style={{ color: '#10b981' }}>{stats.entries}</span>
        </div>
        <div className="notif-kpi-pill">
          <span className="kpi-label">Egresos & Cobros</span>
          <span className="kpi-value" style={{ color: '#38bdf8' }}>{stats.exits}</span>
        </div>
        <div className="notif-kpi-pill">
          <span className="kpi-label">Alertas Críticas</span>
          <span className="kpi-value" style={{ color: '#ef4444' }}>{stats.critical}</span>
        </div>
        <div className="notif-kpi-pill">
          <span className="kpi-label">Push WhatsApp</span>
          <span className="kpi-value" style={{ color: '#25D366' }}>{stats.pushCount}</span>
        </div>
      </div>

      {/* Controles de Filtro y Búsqueda */}
      <div className="notif-toolbar">
        <div className="notif-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            Todos ({stats.total})
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'ALERTS' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALERTS')}
          >
            🚨 Alertas & Aforos ({stats.critical})
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'ENTRY' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ENTRY')}
          >
            🚗 Ingresos ({stats.entries})
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'EXIT' ? 'active' : ''}`}
            onClick={() => setActiveFilter('EXIT')}
          >
            🏁 Egresos ({stats.exits})
          </button>
          <button
            type="button"
            className={`filter-tab ${activeFilter === 'PUSH' ? 'active' : ''}`}
            onClick={() => setActiveFilter('PUSH')}
          >
            💬 Despachos WhatsApp ({stats.pushCount})
          </button>
        </div>

        <div className="notif-search-box">
          <input
            type="text"
            placeholder="Buscar por patente, plaza o planta..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Lista de Eventos y Auditoría */}
      <div className="notif-feed-container">
        {filteredEvents.length === 0 ? (
          <div className="notif-empty-state">
            <span className="empty-icon">📭</span>
            <p className="empty-text">No se encontraron eventos con el criterio seleccionado.</p>
            <small>Los nuevos ingresos, salidas y alertas de plantas se registrarán automáticamente.</small>
          </div>
        ) : (
          <div className="notif-list">
            {filteredEvents.map((item) => {
              const isCrit = item.severity === NotificationSeverity.CRITICAL;
              const isWarn = item.severity === NotificationSeverity.WARNING;

              return (
                <div
                  key={item.id}
                  className={`notif-card ${isCrit ? 'card-critical' : isWarn ? 'card-warning' : 'card-info'}`}
                >
                  <div className="notif-card-main">
                    <div className="notif-card-meta-line">
                      <span className={`severity-tag ${isCrit ? 'tag-crit' : isWarn ? 'tag-warn' : 'tag-info'}`}>
                        {item.severity}
                      </span>
                      <span className="notif-timestamp">{item.timestamp}</span>
                      <span className="notif-id-pill">ID: {item.id}</span>

                      {item.pushStatus && (
                        <span
                          className="whatsapp-dispatched-tag"
                          onClick={() => setInspectedPayload(item.pushStatus)}
                          title="Clic para inspeccionar el payload JSON despachado a la API de WhatsApp"
                        >
                          💬 WhatsApp: {item.pushStatus.target} ({item.pushStatus.state}) 🔍
                        </span>
                      )}
                    </div>

                    <h4 className="notif-card-title">{item.title}</h4>
                    <p className="notif-card-message">{item.message}</p>

                    {/* Ficha de metadata estructurada */}
                    {Object.keys(item.metadata || {}).length > 0 && (
                      <div className="notif-metadata-row">
                        {item.metadata.vehicleId && (
                          <span className="meta-badge">
                            🚗 Patente: <strong>{item.metadata.vehicleId}</strong>
                          </span>
                        )}
                        {item.metadata.spotId && (
                          <span className="meta-badge">
                            🅿️ Plaza: <strong>{item.metadata.spotId}</strong>
                          </span>
                        )}
                        {item.metadata.floor && (
                          <span className="meta-badge">
                            🏢 Planta: <strong>{item.metadata.floor}</strong>
                          </span>
                        )}
                        {item.metadata.amount !== undefined && (
                          <span className="meta-badge meta-amount">
                            💵 Tarifa: <strong>${item.metadata.amount}</strong>
                          </span>
                        )}
                        {item.metadata.eta && (
                          <span className="meta-badge">
                            ⏱️ ETA: <strong>{item.metadata.eta}s</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Configuración de WhatsApp Push */}
      {isConfigModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card whatsapp-config-modal">
            <div className="modal-header">
              <h3>💬 Configuración de Notificaciones Push (WhatsApp API)</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsConfigModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-lead">
                Configure la pasarela para despachar notificaciones automáticas y alertas críticas
                (como <strong>Planta Completa</strong> o <strong>Evacuación</strong>) a supervisores mediante WhatsApp Business Cloud API o Webhooks.
              </p>

              <div className="config-form-group">
                <label className="config-checkbox-label">
                  <input
                    type="checkbox"
                    checked={config.pushEnabled}
                    onChange={(e) => {
                      const updated = { ...config, pushEnabled: e.target.checked };
                      setConfig(updated);
                      notificationService.saveConfig(updated);
                    }}
                  />
                  <span>Habilitar Notificaciones Push Activas</span>
                </label>
              </div>

              <div className="config-form-row">
                <div className="form-field">
                  <label>Proveedor de Mensajería:</label>
                  <select
                    value={config.provider}
                    onChange={(e) => {
                      const updated = { ...config, provider: e.target.value };
                      setConfig(updated);
                      notificationService.saveConfig(updated);
                    }}
                    className="form-select"
                  >
                    <option value="WHATSAPP_CLOUD_API">Meta WhatsApp Business Cloud API (Oficial)</option>
                    <option value="TWILIO">Twilio Programmable Messaging (WhatsApp)</option>
                    <option value="GENERIC_WEBHOOK">Webhook Personalizado (Evolution API / Baileys)</option>
                  </select>
                </div>

                <div className="form-field">
                  <label>Número de WhatsApp Destino (Supervisor / Grupo):</label>
                  <input
                    type="text"
                    value={config.targetPhone}
                    onChange={(e) => {
                      const updated = { ...config, targetPhone: e.target.value };
                      setConfig(updated);
                      notificationService.saveConfig(updated);
                    }}
                    placeholder="+54 9 11 1234-5678"
                    className="form-input"
                  />
                  <small style={{ color: '#94a3b8' }}>Formato internacional E.164 con código de país.</small>
                </div>
              </div>

              <div className="config-form-group">
                <label>Webhook URL (Opcional para envío HTTP real):</label>
                <input
                  type="text"
                  value={config.webhookUrl}
                  onChange={(e) => {
                    const updated = { ...config, webhookUrl: e.target.value };
                    setConfig(updated);
                    notificationService.saveConfig(updated);
                  }}
                  placeholder="https://tu-servidor-whatsapp.com/webhook"
                  className="form-input"
                />
                <small style={{ color: '#94a3b8' }}>
                  Si se deja vacío, el sistema opera en <em>Modo Emulación SDTR</em> generando payloads JSON válidos listos para producción.
                </small>
              </div>

              <div className="config-sub-section">
                <h4>Eventos a Notificar por WhatsApp:</h4>
                <div className="events-checkbox-grid">
                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={config.notifyFloorFull}
                      onChange={(e) => {
                        const updated = { ...config, notifyFloorFull: e.target.checked };
                        setConfig(updated);
                        notificationService.saveConfig(updated);
                      }}
                    />
                    <span>🚨 Planta Completa (100% de ocupación)</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={config.notifyCapacityWarning}
                      onChange={(e) => {
                        const updated = { ...config, notifyCapacityWarning: e.target.checked };
                        setConfig(updated);
                        notificationService.saveConfig(updated);
                      }}
                    />
                    <span>⚠️ Aforo General Crítico (&gt;90%)</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={config.notifyEmergency}
                      onChange={(e) => {
                        const updated = { ...config, notifyEmergency: e.target.checked };
                        setConfig(updated);
                        notificationService.saveConfig(updated);
                      }}
                    />
                    <span>🔥 Alarma de Evacuación WCET</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={config.notifyRampJam}
                      onChange={(e) => {
                        const updated = { ...config, notifyRampJam: e.target.checked };
                        setConfig(updated);
                        notificationService.saveConfig(updated);
                      }}
                    />
                    <span>🚧 Atascamiento de Rampa (Mutex)</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={config.notifyEntries}
                      onChange={(e) => {
                        const updated = { ...config, notifyEntries: e.target.checked };
                        setConfig(updated);
                        notificationService.saveConfig(updated);
                      }}
                    />
                    <span>🚗 Cada Ingreso Vehicular (Opcional)</span>
                  </label>

                  <label className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={config.notifyExits}
                      onChange={(e) => {
                        const updated = { ...config, notifyExits: e.target.checked };
                        setConfig(updated);
                        notificationService.saveConfig(updated);
                      }}
                    />
                    <span>🏁 Cada Egreso y Cobro (Opcional)</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={handleTestPush}
              >
                💬 Enviar Mensaje de Prueba
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsConfigModalOpen(false)}
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Inspector de Payload JSON de WhatsApp */}
      {inspectedPayload && (
        <div className="modal-backdrop">
          <div className="modal-card json-inspector-modal">
            <div className="modal-header">
              <h3>🔍 Inspector de Payload: WhatsApp Cloud API</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setInspectedPayload(null)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="inspector-summary-meta">
                <span>Canal: <strong>{inspectedPayload.channel}</strong></span>
                <span>Destino: <strong>{inspectedPayload.target}</strong></span>
                <span>Hora: <strong>{inspectedPayload.dispatchedAt}</strong></span>
                <span>Estado: <strong style={{ color: '#10b981' }}>{inspectedPayload.statusText}</strong></span>
              </div>

              <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginTop: '12px' }}>
                Payload RFC JSON transmitido a la pasarela:
              </label>
              <pre className="json-code-block">
                {JSON.stringify(inspectedPayload.payload, null, 2)}
              </pre>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setInspectedPayload(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ParkingNotificationCenter;
