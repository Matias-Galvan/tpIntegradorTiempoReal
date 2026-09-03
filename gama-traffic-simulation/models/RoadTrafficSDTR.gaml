/**
 * ============================================================================
 * Modelo: RoadTrafficSDTR.gaml
 * Asignatura: Sistemas Distribuidos de Tiempo Real (SDTR) / Prog. en Tiempo Real
 * Trabajo Integrador: Monitoreo y Control de Tráfico Multi-Agente
 * 
 * Basado en la arquitectura de RoadTrafficModel de GAMA Platform:
 * https://gama-platform.org/wiki/RoadTrafficModel_step1
 *
 * Características:
 * - Red vial sintética autosuficiente (no requiere shapefiles externos para iniciar).
 * - Agentes 'vehicle' con skill 'moving' sobre un grafo espacial 'road_network'.
 * - Curva de congestión macroscópica y desaceleración basada en densidad de tramo.
 * - Variación horaria dinámica (hora pico matutina, valle, mediodía, pico tarde).
 * - Generador de telemetría JSON compatible con el dashboard React (ws://localhost:6868).
 * ============================================================================
 */

model RoadTrafficSDTR

global {
    // ------------------------------------------------------------------------
    // Parámetros y Variables de Estado Globales (Sincronizadas con el Dashboard)
    // ------------------------------------------------------------------------
    int current_hour <- 8 min: 0 max: 23;      // Controlado remotamente desde el slider
    int active_vehicles <- 0;                  // Cantidad actual de agentes vehículo
    int traffic_flow <- 0;                     // Vehículos que completaron su trayecto (aforo)
    int cumulative_flow <- 0;
    string congestion_level <- "FLUID";        // FLUID | MODERATE | CONGESTED | CRITICAL
    int max_capacity_hour <- 450;
    
    // Entorno espacial y topología
    geometry shape <- square(1200 #m);
    float step <- 1.0 #s;
    graph road_network;

    // Métricas para cálculo de congestión global
    float global_avg_density <- 0.0;
    list<road> monitored_roads;

    // ------------------------------------------------------------------------
    // Inicialización del Entorno
    // ------------------------------------------------------------------------
    init {
        write "[GAMA SDTR] Inicializando red vial multi-agente...";
        
        // Crear arterias principales horizontales (Avenidas)
        create road {
            shape <- line([{100, 300}, {1100, 300}]);
            road_name <- "Av. Libertador Norte";
            capacity <- 40;
            max_speed <- 60.0 #km/#h;
        }
        create road {
            shape <- line([{100, 600}, {1100, 600}]);
            road_name <- "Autopista Central";
            capacity <- 70;
            max_speed <- 80.0 #km/#h;
        }
        create road {
            shape <- line([{100, 900}, {1100, 900}]);
            road_name <- "Av. Corrientes Sur";
            capacity <- 40;
            max_speed <- 50.0 #km/#h;
        }

        // Crear arterias verticales (Calles transversales)
        create road {
            shape <- line([{300, 100}, {300, 1100}]);
            road_name <- "Transversal Oeste";
            capacity <- 30;
            max_speed <- 40.0 #km/#h;
        }
        create road {
            shape <- line([{600, 100}, {600, 1100}]);
            road_name <- "Eje Cívico Central";
            capacity <- 35;
            max_speed <- 45.0 #km/#h;
        }
        create road {
            shape <- line([{900, 100}, {900, 1100}]);
            road_name <- "Conector Este";
            capacity <- 30;
            max_speed <- 40.0 #km/#h;
        }

        // Conectar tramos en un grafo de tránsito
        road_network <- as_edge_graph(road);
        
        // Guardar lista de tramos principales para monitoreo de telemetría
        monitored_roads <- list(road);

        // Crear vehículos iniciales
        do spawn_vehicles(25);
        write "[GAMA SDTR] Red vial inicializada con " + length(road) + " tramos y grafo conectado.";
    }

    // ------------------------------------------------------------------------
    // Dinámica Temporal y Generación de Tráfico por Hora
    // ------------------------------------------------------------------------
    reflex traffic_generator {
        // Tasa de generación vehicular según curva horaria (Horas Pico vs Valle)
        float spawn_probability <- 0.15;
        
        int max_capacity_hour <- 200;

        if (current_hour >= 7 and current_hour <= 9) {
            // Hora Pico Mañana
            max_capacity_hour <- 450;
            spawn_probability <- 0.75;
        } else if (current_hour >= 12 and current_hour <= 14) {
            // Mediodía
            max_capacity_hour <- 300;
            spawn_probability <- 0.50;
        } else if (current_hour >= 17 and current_hour <= 19) {
            // Hora Pico Tarde
            max_capacity_hour <- 500;
            spawn_probability <- 0.80;
        } else if (current_hour >= 23 or current_hour <= 5) {
            // Nocturno
            max_capacity_hour <- 40;
            spawn_probability <- 0.05;
        } else {
            // Valle / Diurno regular
            max_capacity_hour <- 200;
            spawn_probability <- 0.30;
        }

        // Inyectar vehículos respetando la capacidad vial de la hora simulada
        if (length(vehicle) < max_capacity_hour and flip(spawn_probability)) {
            int to_spawn <- (current_hour = 8 or current_hour = 18) ? rnd(1, 3) : 1;
            do spawn_vehicles(to_spawn);
        }
    }

    // ------------------------------------------------------------------------
    // Drenaje Dinámico de Congestión al Cambiar de Horario
    // ------------------------------------------------------------------------
    reflex traffic_drain {
        if (length(vehicle) > max_capacity_hour) {
            int excess <- length(vehicle) - max_capacity_hour;
            int to_drain <- min([excess, int(max([1, excess * 0.15]))]);
            ask (to_drain among vehicle) {
                cumulative_flow <- cumulative_flow + 1;
                do die;
            }
        }
    }

    // ------------------------------------------------------------------------
    // Cálculo de Telemetría Macroscópica (SDTR)
    // ------------------------------------------------------------------------
    reflex update_metrics {
        active_vehicles <- length(vehicle);

        // Resetear contadores de vehículos en cada tramo
        ask road {
            current_vehicle_count <- 0;
        }

        // Asignar presencia vehicular al tramo más próximo
        ask vehicle {
            if (current_road != nil) {
                current_road.current_vehicle_count <- current_road.current_vehicle_count + 1;
            }
        }

        // Recalcular densidad y velocidad de cada tramo
        float sum_density <- 0.0;
        ask road {
            // Densidad en porcentaje: (vehículos_actuales / capacidad) * 100
            density <- min([100.0, (current_vehicle_count / float(capacity)) * 100.0]);
            sum_density <- sum_density + density;
        }

        if (length(road) > 0) {
            global_avg_density <- sum_density / length(road);
        }

        // Clasificación de congestión macroscópica
        if (global_avg_density < 35.0) {
            congestion_level <- "FLUID";
        } else if (global_avg_density < 65.0) {
            congestion_level <- "MODERATE";
        } else if (global_avg_density < 85.0) {
            congestion_level <- "CONGESTED";
        } else {
            congestion_level <- "CRITICAL";
        }

        // Aforo estimado (flujo por hora normalizado)
        traffic_flow <- int(active_vehicles * (global_avg_density > 75.0 ? 1.8 : 3.4) + cumulative_flow);

        // Emitir telemetría cada 5 ciclos por consola y socket de GAMA Server
        if (cycle mod 5 = 0) {
            write get_telemetry_json();
        }
    }

    // Acción para generar vehículos en extremos aleatorios de la red
    action spawn_vehicles(int count) {
        create vehicle number: count {
            // Elegir origen y destino en puntos extremos de la red
            location <- any_location_in(one_of(road));
            target_point <- any_location_in(one_of(road));
            speed <- 35.0 #km/#h;
        }
    }

    // Acción para mutar la hora simulada de forma remota
    action set_sim_hour(int new_hour) {
        current_hour <- min([23, max([0, new_hour])]);
        
        if (current_hour >= 7 and current_hour <= 9) {
            max_capacity_hour <- 450;
        } else if (current_hour >= 12 and current_hour <= 14) {
            max_capacity_hour <- 300;
        } else if (current_hour >= 17 and current_hour <= 19) {
            max_capacity_hour <- 500;
        } else if (current_hour >= 23 or current_hour <= 5) {
            max_capacity_hour <- 45;
        } else {
            max_capacity_hour <- 180;
        }

        write "[GAMA SDTR] Hora actualizada remotamente a: " + current_hour + "hs (Meta: " + max_capacity_hour + " veh)";
        return current_hour;
    }

    // ------------------------------------------------------------------------
    // Función de Telemetría en Formato JSON para GAMA Server
    // ------------------------------------------------------------------------
    string get_telemetry_json {
        string roads_json <- "[";
        int idx <- 0;
        loop r over: monitored_roads {
            roads_json <- roads_json + 
                "{\"id\":\"" + r.road_name + 
                "\",\"name\":\"" + r.road_name + 
                "\",\"density\":" + round(r.density) + 
                ",\"vehicles\":" + r.current_vehicle_count + "}";
            idx <- idx + 1;
            if (idx < length(monitored_roads)) {
                roads_json <- roads_json + ",";
            }
        }
        roads_json <- roads_json + "]";

        return "{" +
            "\"type\":\"TELEMETRY_UPDATE\"," +
            "\"traffic_flow\":" + traffic_flow + "," +
            "\"active_vehicles\":" + active_vehicles + "," +
            "\"current_hour\":" + current_hour + "," +
            "\"congestion_level\":\"" + congestion_level + "\"," +
            "\"cycle\":" + cycle + "," +
            "\"road_densities\":" + roads_json +
        "}";
    }
}

// ----------------------------------------------------------------------------
// Especie 'road': Segmento de vía con capacidad finita y ley de congestión
// ----------------------------------------------------------------------------
species road {
    string road_name;
    int capacity <- 35;
    int current_vehicle_count <- 0;
    float density <- 0.0; // 0 a 100%
    float max_speed <- 60.0 #km/#h;

    aspect default {
        // Semáforo dinámico según nivel de saturación
        rgb color_road <- density > 80.0 ? #red : (density > 50.0 ? #orange : #green);
        draw shape color: color_road width: 4.0;
    }
}

// ----------------------------------------------------------------------------
// Especie 'vehicle': Agente móvil que navega sobre el grafo de tránsito
// ----------------------------------------------------------------------------
species vehicle skills: [moving] {
    point target_point;
    road current_road;
    rgb vehicle_color <- rnd_color(255);

    reflex travel {
        // Identificar el tramo en el que se encuentra
        current_road <- road closest_to(location);

        // Desaceleración en tramos congestionados (Relación fundamental de tráfico)
        float effective_speed <- 45.0 #km/#h;
        if (current_road != nil) {
            // Si la densidad es 100%, la velocidad cae a un mínimo de 8 km/h
            float factor <- max([0.15, 1.0 - (current_road.density / 120.0)]);
            effective_speed <- current_road.max_speed * factor;
        }

        // Moverse hacia el destino utilizando el camino más corto del grafo
        do goto target: target_point on: road_network speed: effective_speed;

        // Al alcanzar el destino, computar aforo y renovar recorrido o finalizar
        if (location distance_to target_point < 15 #m) {
            cumulative_flow <- cumulative_flow + 1;
            
            // Renovar recorrido o abandonar la red en equilibrio dinámico
            float renew_prob <- length(vehicle) > 350 ? 0.35 : 0.70;
            if (flip(renew_prob)) {
                target_point <- any_location_in(one_of(road));
            } else {
                do die;
            }
        }
    }

    aspect default {
        draw circle(8 #m) color: vehicle_color border: #white;
    }
}

// ----------------------------------------------------------------------------
// Experimento 1: GUI interactiva en GAMA Platform
// ----------------------------------------------------------------------------
experiment TrafficSimulation type: gui {
    parameter "Hora del Día (0-23hs):" var: current_hour category: "Control SDTR";
    
    output {
        display CityTrafficView type: 2d {
            species road aspect: default;
            species vehicle aspect: default;
        }

        display TelemetryCharts refresh: every(5 #cycles) {
            chart "Dinámica Vehicular en Tiempo Real" type: series {
                data "Vehículos Activos" value: active_vehicles color: #blue;
                data "Densidad Media (%)" value: global_avg_density color: #orange;
            }
        }
    }
}

// ----------------------------------------------------------------------------
// Experimento 2: Servidor Headless para GAMA Server (WebSocket ws://localhost:6868)
// ----------------------------------------------------------------------------
experiment HeadlessServer type: gui {
    parameter "current_hour" var: current_hour;
}

