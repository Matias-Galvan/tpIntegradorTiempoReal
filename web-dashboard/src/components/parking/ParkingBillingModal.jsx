import React from 'react';
import { calculateParkingFee } from '../../utils/parkingDataHelper';

/**
 * ParkingBillingModal
 * Modal de Facturación y Ticket Digital de Salida en Tiempo Real (T_out - T_in).
 * Genera el desglose tarifario fraccionado, recargo por carga EV, bonificación PMR y cobro digital.
 */
export const ParkingBillingModal = React.memo(function ParkingBillingModal({
  spot,
  onConfirmCheckout,
  onClose,
}) {
  if (!spot) return null;

  const now = new Date();
  const timeOutStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

  // Calcular duración real o estimada en minutos
  const durationMin = spot.duration > 0 ? spot.duration : 60;
  const billing = calculateParkingFee(durationMin, spot.vehicleType || 'AUTO', spot.spotType);

  const ticketNumber = `TCK-${spot.floor}${spot.num}-${Math.floor(1000 + Math.random() * 9000)}`;

  const handlePay = () => {
    if (onConfirmCheckout) {
      onConfirmCheckout(spot, billing.totalAmount, timeOutStr);
    }
  };

  return (
    <div className="billing-modal-backdrop" onClick={onClose}>
      <div className="billing-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ticket-header">
          <div className="ticket-logo">
            <span className="logo-icon">🅿️</span>
            <div>
              <h3>ESTACIONAMIENTO INTELIGENTE SDTR</h3>
              <span className="ticket-sub">COMPROBANTE ELECTRÓNICO DE COBRO Y ESTADÍA</span>
            </div>
          </div>
          <button type="button" className="ticket-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="ticket-dashed-separator" />

        {/* Datos Principales */}
        <div className="ticket-body">
          <div className="ticket-row-meta">
            <span>Ticket: <strong>{ticketNumber}</strong></span>
            <span>Fecha: <strong>{now.toLocaleDateString()}</strong></span>
          </div>

          <div className="ticket-highlight-box">
            <div className="highlight-col">
              <span className="hl-label">PATENTE / VEHÍCULO</span>
              <span className="hl-value font-mono">
                {spot.car} <small style={{ color: '#38bdf8', fontSize: '0.8em' }}>({billing.vehicleType === '4X4' ? '🚙 4x4 / Pick-up' : '🚗 Auto'})</small>
              </span>
            </div>
            <div className="highlight-col">
              <span className="hl-label">PLAZA ASIGNADA</span>
              <span className="hl-value font-mono">
                {spot.id} ({spot.spotType === 'PMR' ? '♿ PMR' : spot.spotType === 'EV' ? '⚡ EV' : 'Estándar'})
              </span>
            </div>
          </div>

          <div className="ticket-times-grid">
            <div className="time-item">
              <span className="time-label">🟢 Hora Entrada (T_in):</span>
              <span className="time-val font-mono">{spot.t_in || '08:15:00'}</span>
            </div>
            <div className="time-item">
              <span className="time-label">🔵 Hora Salida (T_out):</span>
              <span className="time-val font-mono">{timeOutStr}</span>
            </div>
            <div className="time-item">
              <span className="time-label">⏱️ Estadía Transcurrida:</span>
              <span className="time-val font-mono highlight-duration">
                {billing.formattedDuration} ({billing.hours}h facturables)
              </span>
            </div>
          </div>

          {/* Desglose de Tarifación */}
          <div className="ticket-billing-breakdown">
            {billing.isPromoApplied ? (
              <>
                <div className="breakdown-row" style={{ color: '#94a3b8' }}>
                  <span>Cómputo estándar ({billing.hours}h × ${billing.baseHourlyRate.toLocaleString()}):</span>
                  <span style={{ textDecoration: 'line-through' }}>${billing.normalCost.toLocaleString()}</span>
                </div>
                <div className="breakdown-row" style={{ color: '#10b981', fontWeight: 'bold' }}>
                  <span>{billing.promoName}:</span>
                  <span>-${billing.promoSavings.toLocaleString()} de Ahorro</span>
                </div>
                <div className="breakdown-row">
                  <span>Subtotal con Promo de Estadía:</span>
                  <span>${billing.baseSubtotal.toLocaleString()}</span>
                </div>
              </>
            ) : (
              <div className="breakdown-row">
                <span>Tarifa ({billing.hours}h × ${billing.baseHourlyRate.toLocaleString()}/h):</span>
                <span>${billing.baseSubtotal.toLocaleString()}</span>
              </div>
            )}

            {billing.chargingFee > 0 && (
              <div className="breakdown-row row-ev">
                <span>⚡ Servicio de Carga Eléctrica 22kW:</span>
                <span>+${billing.chargingFee.toLocaleString()}</span>
              </div>
            )}

            {billing.discountAmount > 0 && (
              <div className="breakdown-row row-discount">
                <span>♿ Bonificación Movilidad Reducida ({billing.discountPercent}%):</span>
                <span>-${billing.discountAmount.toLocaleString()}</span>
              </div>
            )}

            <div className="ticket-dashed-separator" style={{ margin: '8px 0' }} />

            <div className="breakdown-total-row">
              <span>TOTAL A PAGAR:</span>
              <span className="total-price font-mono">${billing.totalAmount.toLocaleString()} ARS</span>
            </div>

            {/* Referencia del cuadro tarifario oficial */}
            <div style={{ marginTop: '10px', padding: '6px 10px', background: '#020617', borderRadius: '6px', fontSize: '11px', color: '#94a3b8', border: '1px solid #1e293b' }}>
              <strong>Cuadro Tarifario Oficial:</strong>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                <span>🚗 <strong>Auto:</strong> $1.400/h • 12h: <strong>$14.000</strong></span>
                <span>🚙 <strong>4x4:</strong> $2.800/h • 12h: <strong>$28.000</strong></span>
              </div>
            </div>
          </div>

          {/* Código de barras / QR simulado */}
          <div className="ticket-barcode-section">
            <div className="fake-barcode" />
            <span className="barcode-number">{ticketNumber} • LPR-AUTO-CHECKOUT</span>
          </div>
        </div>

        {/* Acciones de Pago */}
        <div className="ticket-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary btn-checkout pulse-glow" onClick={handlePay}>
            💳 Procesar Cobro y Salida Automática
          </button>
        </div>
      </div>
    </div>
  );
});

export default ParkingBillingModal;

