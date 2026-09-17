import React, { useState, useMemo } from 'react';

/**
 * VehicleFinderBar
 * Buscador inteligente de vehículos ("¿Dónde dejé mi auto?").
 * Permite al usuario ingresar una patente para localizar su vehículo,
 * conmutando automáticamente de planta y trazando la ruta peatonal desde el ascensor.
 */
export const VehicleFinderBar = React.memo(function VehicleFinderBar({
  spots = [],
  activeSearchSpot = null,
  onVehicleFound,
  onClearSearch,
}) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  // Lista de autos actualmente estacionados
  const parkedVehicles = useMemo(() => {
    return spots.filter((s) => s.occ && s.car);
  }, [spots]);

  // Coincidencias de búsqueda
  const matches = useMemo(() => {
    const cleanQuery = query.trim().toUpperCase().replace(/-/g, ' ');
    if (cleanQuery.length < 2) return [];

    return parkedVehicles.filter((s) => {
      const cleanCar = s.car.toUpperCase().replace(/-/g, ' ');
      return cleanCar.includes(cleanQuery) || s.id.toUpperCase().includes(cleanQuery);
    }).slice(0, 6);
  }, [query, parkedVehicles]);

  const handleSelectSpot = (spot) => {
    setQuery(spot.car);
    setIsFocused(false);
    if (onVehicleFound) onVehicleFound(spot);
  };

  const handleClear = () => {
    setQuery('');
    if (onClearSearch) onClearSearch();
  };

  return (
    <div className="vehicle-finder-container">
      <div className="finder-input-wrapper">
        <span className="finder-icon">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          placeholder="¿Dónde dejé mi auto? Ingrese patente o puesto (ej: AA 948 XP, A-12)..."
          className="finder-input"
        />

        {query && (
          <button
            type="button"
            className="finder-clear-btn"
            onClick={handleClear}
            title="Limpiar búsqueda"
          >
            ✕
          </button>
        )}

        {/* Dropdown de coincidencias en vivo */}
        {isFocused && matches.length > 0 && (
          <div className="finder-dropdown">
            <div className="dropdown-header">
              <span>VEHÍCULOS ENCONTRADOS ({matches.length})</span>
            </div>
            {matches.map((spot) => (
              <div
                key={spot.id}
                className="finder-dropdown-item"
                onMouseDown={() => handleSelectSpot(spot)}
              >
                <div className="item-main">
                  <span className="item-icon">{spot.spotType === 'PMR' ? '♿' : spot.spotType === 'EV' ? '⚡' : '🚗'}</span>
                  <span className="item-plate font-mono">{spot.car}</span>
                </div>
                <div className="item-location">
                  <span className="item-badge">Planta {spot.floor}</span>
                  <span className="item-spot font-mono">{spot.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Banner de resultado activo si se encontró el vehículo */}
      {activeSearchSpot && (
        <div className="finder-active-banner">
          <div className="active-banner-info">
            <span className="banner-pin">📍</span>
            <span>
              Vehículo <strong>{activeSearchSpot.car}</strong> ubicado en <strong>Plaza {activeSearchSpot.id}</strong> (Planta {activeSearchSpot.floor}).
            </span>
            <span className="banner-route-tag">Ruta peatonal trazada desde el Ascensor</span>
          </div>
          <button
            type="button"
            className="active-banner-close"
            onClick={handleClear}
            title="Quitar ruta"
          >
            ✕ Quitar Ruta
          </button>
        </div>
      )}
    </div>
  );
});

export default VehicleFinderBar;

