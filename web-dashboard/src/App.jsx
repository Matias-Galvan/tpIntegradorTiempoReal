import { useState, useEffect } from 'react';
import useGamaSimulation from './hooks/useGamaSimulation';
import SimulationControls from './components/SimulationControls';
import DashboardView from './components/DashboardView';
import ParkingDashboard from './components/parking/ParkingDashboard';
import { gamaSocket } from './services/gamaSocket';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('sdtr_active_tab') || 'PARKING';
  });

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

  useEffect(() => {
    localStorage.setItem('sdtr_active_tab', activeTab);
    gamaSocket.setActiveModule(activeTab);
  }, [activeTab]);

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    gamaSocket.setActiveModule(tab);
  };

  // Inyección de telemetría de prueba para desarrollo local
  const handleSimulateTelemetry = () => {
    if (activeTab === 'TRAFFIC') {
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
          { id: 'libertador', name: 'Av. Libertador Norte', density: Math.floor(Math.random() * 95) },
          { id: 'autopista', name: 'Autopista Central', density: Math.floor(Math.random() * 98) },
          { id: 'corrientes', name: 'Av. Corrientes Sur', density: Math.floor(Math.random() * 85) },
          { id: 'transversal_oeste', name: 'Transversal Oeste', density: Math.floor(Math.random() * 70) },
          { id: 'eje_civico', name: 'Eje Cívico Central', density: Math.floor(Math.random() * 75) },
          { id: 'conector_este', name: 'Conector Este', density: Math.floor(Math.random() * 65) },
        ],
        timestamp: Date.now(),
      });
    } else {
      gamaSocket._notifySubscribers({
        type: 'PARKING_TELEMETRY_UPDATE',
        cycle: (simulationData.cycle || 0) + 1,
        totalSpots: 400,
        totalOccupied: Math.floor(100 + Math.random() * 250),
        totalAvailable: Math.floor(50 + Math.random() * 150),
        inTransit: Math.floor(2 + Math.random() * 6),
        isJamActive: false,
        floors: [
          { floor: 'A', occupied: Math.floor(20 + Math.random() * 60), available: 40, total: 100 },
          { floor: 'B', occupied: Math.floor(30 + Math.random() * 50), available: 50, total: 100 },
          { floor: 'C', occupied: Math.floor(15 + Math.random() * 70), available: 35, total: 100 },
          { floor: 'D', occupied: Math.floor(10 + Math.random() * 80), available: 60, total: 100 },
        ],
        timestamp: Date.now(),
      });
    }
  };


  return (
    <div className="app-layout">
      {/* Header Principal */}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-logo">
            <span>{activeTab === 'TRAFFIC' ? '🚦' : '🅿️'}</span>
          </div>
          <div>
            <h1 className="brand-title">
              {activeTab === 'TRAFFIC' ? 'Centro de Control de Tráfico Urbano' : 'Estacionamiento Inteligente Multi-Planta'}
            </h1>
            <p className="brand-subtitle">
              Sistemas Distribuidos de Tiempo Real (SDTR) • GAMA Platform & React Vite
            </p>
          </div>
        </div>

        {/* Selector de Módulos (Tabs) */}
        <div className="app-module-tabs">
          <button
            type="button"
            className={`module-tab-btn ${activeTab === 'TRAFFIC' ? 'tab-active' : ''}`}
            onClick={() => handleTabSwitch('TRAFFIC')}
          >
            <span>🚦</span>
            <span>Tráfico Urbano</span>
          </button>
          <button
            type="button"
            className={`module-tab-btn ${activeTab === 'PARKING' ? 'tab-active' : ''}`}
            onClick={() => handleTabSwitch('PARKING')}
          >
            <span>🅿️</span>
            <span>Estacionamiento 4 Plantas</span>
          </button>
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
              (Útil para verificar la reactividad y controles con o sin GAMA abierto)
            </span>
          </div>
        </div>
      )}

      {/* Contenido Principal según el módulo activo */}
      <main className="app-main">
        {activeTab === 'TRAFFIC' ? (
          <>
            <SimulationControls
              isConnected={isConnected}
              currentHour={simulationData.currentHour}
              onPlay={play}
              onPause={pause}
              onStep={step}
              onSetHour={setHour}
            />

            <DashboardView
              simulationData={simulationData}
              isConnected={isConnected}
              connectionState={connectionState}
            />
          </>
        ) : (
          <ParkingDashboard />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Trabajo Integrador de Programación en Tiempo Real • GAMA Platform WebSocket Middleware (4 Plantas / 400 Plazas)
        </p>
      </footer>
    </div>
  );
}

export default App;
