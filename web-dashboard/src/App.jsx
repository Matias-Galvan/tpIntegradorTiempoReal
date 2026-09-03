import { useState } from 'react';
import useGamaSimulation from './hooks/useGamaSimulation';
import SimulationControls from './components/SimulationControls';
import DashboardView from './components/DashboardView';
import { gamaSocket } from './services/gamaSocket';
import './App.css';

function App() {
  const {
    isConnected,
    connectionState,
    simulationData,
    play,
    pause,
    step,
    setHour,
  } = useGamaSimulation();

  const [devToolsOpen, setDevToolsOpen] = useState(false);

  // Función de testeo para simular eventos de telemetría entrantes localmente si GAMA Server está apagado
  const handleSimulateTelemetry = () => {
    const randomVehicles = Math.floor(Math.random() * 450) + 50;
    const randomFlow = Math.floor(randomVehicles * 3.8);
    const levels = ['FLUID', 'MODERATE', 'CONGESTED', 'CRITICAL'];
    const randomLevel = levels[Math.floor(Math.random() * levels.length)];

    gamaSocket._notifySubscribers({
      type: 'TELEMETRY_UPDATE',
      currentHour: simulationData.currentHour,
      trafficFlow: randomFlow,
      activeVehicles: randomVehicles,
      congestionLevel: randomLevel,
      cycle: (simulationData.cycle || 0) + 1,
      roadDensities: [
        { id: 'avenida_norte', name: 'Av. Libertador Norte', density: Math.floor(Math.random() * 95) },
        { id: 'avenida_sur', name: 'Av. Corrientes Sur', density: Math.floor(Math.random() * 85) },
        { id: 'autopista_este', name: 'Autopista Illia', density: Math.floor(Math.random() * 98) },
        { id: 'circunvalacion', name: 'Anillo de Circunvalación', density: Math.floor(Math.random() * 70) },
      ],
      timestamp: Date.now(),
    });
  };

  return (
    <div className="app-layout">
      {/* Header Principal */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">
            <span>🚦</span>
          </div>
          <div>
            <h1 className="brand-title">GAMA Traffic Control Center</h1>
            <p className="brand-subtitle">
              Sistemas Distribuidos de Tiempo Real (SDTR) • RoadTrafficModel
            </p>
          </div>
        </div>

        <div className="header-actions">
          <div className="endpoint-badge">
            <span className="endpoint-icon">🔌</span>
            <span className="endpoint-text">ws://localhost:6868</span>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setDevToolsOpen((prev) => !prev)}
            title="Herramientas de diagnóstico y pruebas"
          >
            🛠️ Pruebas SDTR
          </button>
        </div>
      </header>

      {/* Barra de diagnóstico opcional para desarrollo */}
      {devToolsOpen && (
        <div className="devtools-bar">
          <div className="devtools-content">
            <span className="devtools-label">Diagnóstico de Telemetría (DevTools):</span>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={handleSimulateTelemetry}
            >
              ⚡ Inyectar Telemetría de Prueba (Mock)
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => gamaSocket.connect()}
            >
              🔄 Forzar Reconexión
            </button>
            <span className="devtools-note">
              (Útil para verificar la reactividad y throttling mientras GAMA Platform no está iniciado)
            </span>
          </div>
        </div>
      )}

      {/* Contenido Principal */}
      <main className="app-main">
        {/* Panel de Controles */}
        <SimulationControls
          isConnected={isConnected}
          currentHour={simulationData.currentHour}
          onPlay={play}
          onPause={pause}
          onStep={step}
          onSetHour={setHour}
        />

        {/* Tablero de Telemetría en Tiempo Real */}
        <DashboardView
          simulationData={simulationData}
          isConnected={isConnected}
          connectionState={connectionState}
        />
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Trabajo Integrador de Programación en Tiempo Real • GAMA Platform WebSocket Middleware
        </p>
      </footer>
    </div>
  );
}

export default App;
