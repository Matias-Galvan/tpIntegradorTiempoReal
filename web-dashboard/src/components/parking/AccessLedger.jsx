import React from 'react';

/**
 * AccessLedger
 * Registro en tiempo real de accesos (Entrada principal con T_in y Salida con T_out y duración).
 */
export const AccessLedger = React.memo(function AccessLedger({
  ledger = [],
  totalOccupied = 0,
}) {
  const defaultLedger = [
    { type: 'ENTRY', vehicleId: 'AF 821 KN', spotId: 'B-14', floor: 'B', time: '14:20:12', durationSec: null },
    { type: 'ENTRY', vehicleId: 'AE 392 LP', spotId: 'A-78', floor: 'A', time: '14:21:45', durationSec: null },
    { type: 'EXIT', vehicleId: 'AD 104 XM', spotId: 'C-02', floor: 'C', time: '14:22:10', durationSec: 2840 },
    { type: 'ENTRY', vehicleId: 'AC 551 TT', spotId: 'D-33', floor: 'D', time: '14:23:05', durationSec: null },
  ];

  const list = ledger && ledger.length > 0 ? ledger : defaultLedger;

  const formatDuration = (sec) => {
    if (!sec) return '--';
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    if (minutes > 60) {
      const hours = Math.floor(minutes / 60);
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="panel-card access-ledger-panel">
      <div className="panel-header">
        <div className="header-title">
          <span className="control-icon">⏱️</span>
          <div>
            <h3>Control de Accesos y Bitácora Temporal (T_in / T_out)</h3>
            <span className="panel-hint">
              Entrada y salida exacta de vehículos • {totalOccupied} vehículos registrados actualmente
            </span>
          </div>
        </div>
      </div>

      <div className="ledger-table-wrapper">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Evento</th>
              <th>Vehículo / Patente</th>
              <th>Plaza</th>
              <th>Planta</th>
              <th>Hora Exacta (T)</th>
              <th>Estadía</th>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 10).map((row, idx) => {
              const isEntry = row.type === 'ENTRY';

              return (
                <tr key={`${row.vehicleId}-${idx}`} className={isEntry ? 'row-entry' : 'row-exit'}>
                  <td>
                    <span className={`event-badge ${isEntry ? 'badge-entry' : 'badge-exit'}`}>
                      {isEntry ? '🟢 INGRESO (T_in)' : '🔵 EGRESO (T_out)'}
                    </span>
                  </td>
                  <td className="font-mono font-bold">{row.vehicleId}</td>
                  <td>
                    <span className="spot-table-pill">{row.spotId}</span>
                  </td>
                  <td>Planta {row.floor}</td>
                  <td className="font-mono highlight-time">{row.time}</td>
                  <td className="font-mono">{isEntry ? 'En curso...' : formatDuration(row.durationSec)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default AccessLedger;

