model SmartParkingSDTR

global {
    list<string> floors <- ["A", "B", "C", "D"];
    int total_spots <- 400;
    int total_occupied <- 0;
    int total_available <- 400;
    float arrival_rate <- 0.45;
    int active_in_transit <- 0;
    bool jam_active <- false;
    string jammed_corridor <- "";
    geometry shape <- square(1000 #m);
    float step <- 1.0 #s;

    list<parking_spot> all_spots;
    list<corridor> all_corridors;

    init {
        write "[GAMA PARKING SDTR] Inicializando...";
        loop f over: floors {
            loop i from: 1 to: 100 {
                create parking_spot {
                    floor_name <- f;
                    spot_number <- i;
                    spot_id <- f + "-" + i;
                    is_occupied <- false;
                    parked_vehicle_id <- "";
                    entry_time_str <- "";
                    parked_cycles <- 0;
                }
            }
        }
        all_spots <- list(parking_spot);

        create corridor number: 1 {
            corridor_id <- "RAMP_A_B";
            corridor_name <- "Rampa Planta A -> B";
            is_ramp <- true;
            capacity <- 8;
        }
        create corridor number: 1 {
            corridor_id <- "RAMP_B_C";
            corridor_name <- "Rampa Planta B -> C";
            is_ramp <- true;
            capacity <- 8;
        }
        create corridor number: 1 {
            corridor_id <- "RAMP_C_D";
            corridor_name <- "Rampa Planta C -> D";
            is_ramp <- true;
            capacity <- 8;
        }
        create corridor number: 1 {
            corridor_id <- "AISLE_A";
            corridor_name <- "Pasillo Principal Planta A";
            is_ramp <- false;
            capacity <- 14;
        }
        create corridor number: 1 {
            corridor_id <- "AISLE_B";
            corridor_name <- "Pasillo Principal Planta B";
            is_ramp <- false;
            capacity <- 14;
        }
        create corridor number: 1 {
            corridor_id <- "AISLE_C";
            corridor_name <- "Pasillo Principal Planta C";
            is_ramp <- false;
            capacity <- 14;
        }
        create corridor number: 1 {
            corridor_id <- "AISLE_D";
            corridor_name <- "Pasillo Principal Planta D";
            is_ramp <- false;
            capacity <- 14;
        }
        all_corridors <- list(corridor);

        ask 140 among all_spots {
            is_occupied <- true;
            parked_vehicle_id <- "CAR-" + rnd(1000, 9999);
            entry_time_str <- "08:15:30";
            parked_cycles <- rnd(60, 600);
        }

        total_occupied <- length(all_spots where (each.is_occupied));
        total_available <- total_spots - total_occupied;
    }

    reflex vehicle_generator {
        if (total_available > 0 and flip(arrival_rate)) {
            list<parking_spot> free_spots <- all_spots where (!each.is_occupied);
            if (!empty(free_spots)) {
                parking_spot target <- one_of(free_spots);
                create parking_vehicle {
                    vehicle_id <- "ARG-" + rnd(100, 999) + "-" + (cycle mod 100);
                    target_spot <- target;
                    state <- "NAVIGATING";
                    assigned_floor <- target.floor_name;
                    navigation_time_left <- rnd(5, 15);
                    entry_cycle <- cycle;
                    entry_timestamp <- "08:30:00";
                }
            }
        }
    }

    reflex update_vehicles {
        active_in_transit <- length(parking_vehicle where (each.state = "NAVIGATING" or each.state = "EXITING"));

        ask parking_vehicle {
            if (state = "NAVIGATING") {
                navigation_time_left <- navigation_time_left - 1;
                if (navigation_time_left <= 0) {
                    state <- "PARKED";
                    target_spot.is_occupied <- true;
                    target_spot.parked_vehicle_id <- vehicle_id;
                    target_spot.entry_time_str <- entry_timestamp;
                    parking_duration <- rnd(30, 180);
                }
            } else if (state = "PARKED") {
                parking_duration <- parking_duration - 1;
                target_spot.parked_cycles <- target_spot.parked_cycles + 1;

                if (parking_duration <= 0) {
                    state <- "EXITING";
                    target_spot.is_occupied <- false;
                    target_spot.parked_vehicle_id <- "";
                    exit_time_left <- rnd(5, 12);
                }
            } else if (state = "EXITING") {
                exit_time_left <- exit_time_left - 1;
                if (exit_time_left <= 0) {
                    do die;
                }
            }
        }

        total_occupied <- length(all_spots where (each.is_occupied));
        total_available <- total_spots - total_occupied;
    }

    reflex jam_detector {
        ask corridor {
            int vehicles_in_zone <- length(parking_vehicle where (each.state = "NAVIGATING"));
            current_vehicles <- vehicles_in_zone;
            density <- min([100.0, (current_vehicles / capacity) * 100.0]);
            is_jammed <- density >= 75.0 or (jam_active and corridor_id = jammed_corridor);
        }
    }

    reflex emit_telemetry {
        write get_parking_telemetry_json();
    }

    action spawn_manual_vehicle {
        list<parking_spot> free_spots <- all_spots where (!each.is_occupied);
        if (!empty(free_spots)) {
            parking_spot target <- one_of(free_spots);
            create parking_vehicle {
                vehicle_id <- "ARG-" + rnd(100, 999) + "-M";
                target_spot <- target;
                state <- "NAVIGATING";
                assigned_floor <- target.floor_name;
                navigation_time_left <- rnd(2, 6);
                entry_cycle <- cycle;
                entry_timestamp <- "09:00:00";
            }
            write "[GAMA PARKING] Ingreso manual de vehículo inyectado en entrada principal.";
        }
    }

    action set_arrival_rate_cmd(float new_rate) {
        arrival_rate <- min([1.0, max([0.05, new_rate])]);
        return arrival_rate;
    }

    action trigger_jam_cmd(string corridor_target) {
        jam_active <- true;
        jammed_corridor <- (corridor_target != "") ? corridor_target : "RAMP_A_B";
        return jam_active;
    }

    action clear_jam_cmd {
        jam_active <- false;
        jammed_corridor <- "";
        return jam_active;
    }

    string get_parking_telemetry_json {
        string floors_json <- "[";
        int f_idx <- 0;
        loop f over: floors {
            list<parking_spot> floor_spots <- all_spots where (each.floor_name = f);
            int occ <- length(floor_spots where (each.is_occupied));
            int free <- length(floor_spots) - occ;

            floors_json <- floors_json + 
                "{\"floor\":\"" + f + 
                "\",\"occupied\":" + occ + 
                ",\"available\":" + free + 
                ",\"total\":100}";

            f_idx <- f_idx + 1;
            if (f_idx < length(floors)) {
                floors_json <- floors_json + ",";
            }
        }
        floors_json <- floors_json + "]";

        string corridors_json <- "[";
        int c_idx <- 0;
        loop c over: all_corridors {
            corridors_json <- corridors_json +
                "{\"id\":\"" + c.corridor_id + 
                "\",\"name\":\"" + c.corridor_name + 
                "\",\"density\":" + round(c.density) + 
                ",\"vehicles\":" + c.current_vehicles + 
                ",\"is_jammed\":" + (c.is_jammed ? "true" : "false") + "}";

            c_idx <- c_idx + 1;
            if (c_idx < length(all_corridors)) {
                corridors_json <- corridors_json + ",";
            }
        }
        corridors_json <- corridors_json + "]";

        string spots_json <- "[";
        int s_idx <- 0;
        loop s over: all_spots {
            spots_json <- spots_json +
                "{\"id\":\"" + s.spot_id + 
                "\",\"floor\":\"" + s.floor_name + 
                "\",\"num\":" + s.spot_number + 
                ",\"occ\":" + (s.is_occupied ? "true" : "false") + 
                ",\"car\":\"" + s.parked_vehicle_id + 
                "\",\"t_in\":\"" + s.entry_time_str + "\"}";

            s_idx <- s_idx + 1;
            if (s_idx < length(all_spots)) {
                spots_json <- spots_json + ",";
            }
        }
        spots_json <- spots_json + "]";

        string res <- "{" +
            "\"type\":\"PARKING_TELEMETRY_UPDATE\"," +
            "\"cycle\":" + cycle + "," +
            "\"total_spots\":" + total_spots + "," +
            "\"total_occupied\":" + total_occupied + "," +
            "\"total_available\":" + total_available + "," +
            "\"in_transit\":" + active_in_transit + "," +
            "\"floors\":" + floors_json + "," +
            "\"corridors\":" + corridors_json + "," +
            "\"spots\":" + spots_json +
        "}";

        return res;
    }
}

species parking_spot {
    string floor_name;
    int spot_number;
    string spot_id;
    bool is_occupied;
    string parked_vehicle_id;
    string entry_time_str;
    int parked_cycles;
}

species corridor {
    string corridor_id;
    string corridor_name;
    bool is_ramp;
    int capacity;
    int current_vehicles <- 0;
    float density <- 0.0;
    bool is_jammed <- false;
}

species parking_vehicle skills: [moving] {
    string vehicle_id;
    string assigned_floor;
    parking_spot target_spot;
    string state;
    int navigation_time_left;
    int parking_duration;
    int exit_time_left;
    int entry_cycle;
    string entry_timestamp;
}

experiment HeadlessParkingServer type: gui {
    parameter "Tasa de Arribos:" var: arrival_rate;
}
