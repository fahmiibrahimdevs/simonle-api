export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, any>;
  error?: string;
}

export interface SensorTelemetryEntity {
  id?: number;
  temperature: number;
  tds: number;
  ph: number;
  water_level: number;
  created_at: string;
}

export interface SystemConfigEntity {
  id?: number;
  durasi_istirahat_sistem: number;
  durasi_pompa_on: number;
  tambahan_waktu: number;
  max_perulangan: number;

  // Offsets
  offset_temp: number;
  offset_tds: number;
  offset_ph: number;
  offset_wl: number;

  // Temperature
  enable_temp: boolean;
  safe_temp_min: number;
  safe_temp_max: number;
  warn_temp_min1?: number;
  warn_temp_max1?: number;
  warn_temp_min2?: number;
  warn_temp_max2?: number;
  danger_temp_min1?: number;
  danger_temp_max1?: number;
  danger_temp_min2?: number;
  danger_temp_max2?: number;

  // TDS
  enable_tds: boolean;
  safe_tds_min: number;
  safe_tds_max: number;
  warn_tds_min1?: number;
  warn_tds_max1?: number;
  warn_tds_min2?: number;
  warn_tds_max2?: number;
  danger_tds_min1?: number;
  danger_tds_max1?: number;

  // pH
  enable_ph: boolean;
  safe_ph_min: number;
  safe_ph_max: number;
  warn_ph_min1?: number;
  warn_ph_max1?: number;
  warn_ph_min2?: number;
  warn_ph_max2?: number;
  danger_ph_min1?: number;
  danger_ph_max1?: number;
  danger_ph_min2?: number;
  danger_ph_max2?: number;

  // Water level
  enable_wl: boolean;
  safe_wl_min: number;
  safe_wl_max: number;
  warn_wl_min: number;
  warn_wl_max: number;
  danger_wl_min: number;
  danger_wl_max: number;

  updated_at?: string;
}

export interface ActuatorLogEntity {
  id?: number | string;
  actuator_name: string;
  action: string;
  triggered_by: string;
  created_at?: string;
}

export interface AutomationCycleLogEntity {
  id?: number;
  cycle_id?: number;
  event_type: 'pompa_on' | 'cek_sensor' | 'pompa_off';
  overall_status?: string;
  avg_temperature?: number | null;
  temperature_status?: string | null;
  avg_tds?: number | null;
  tds_status?: string | null;
  avg_ph?: number | null;
  ph_status?: string | null;
  avg_water_level?: number | null;
  water_level_status?: string | null;
  logged_at?: string;
}

export interface AutomationCycleEntity {
  id?: number;
  cycle_number: number;
  start_time: string;
  end_time?: string | null;
  status: 'berjalan' | 'selesai';
  logs?: AutomationCycleLogEntity[];
}

export interface SystemAlertEntity {
  id?: number;
  type: string;
  sensor_name?: string;
  severity_level: 'Bahaya' | 'Peringatan' | string;
  value?: number;
  message: string;
  is_read: boolean;
  created_at: string;
}
