-- ============================================================================
-- SIMONLE Database Schema DDL (PostgreSQL 16)
-- High Performance Time-Series Optimized with BRIN Indexes & Strict Constraints
-- ============================================================================

-- 1. Sensor Telemetry Table
CREATE TABLE IF NOT EXISTS sensor_telemetries (
    id BIGSERIAL PRIMARY KEY,
    temperature REAL NOT NULL,
    tds REAL NOT NULL,
    ph REAL NOT NULL,
    water_level REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- High Performance BRIN Index for Append-Only Time-Series Telemetry (99% smaller than B-Tree)
CREATE INDEX IF NOT EXISTS idx_sensor_telemetries_created_at_brin 
ON sensor_telemetries USING BRIN (created_at);

-- Standard B-Tree for fast ID pagination
CREATE INDEX IF NOT EXISTS idx_sensor_telemetries_id_desc 
ON sensor_telemetries (id DESC);


-- 2. System Configurations Table (Single active configuration row)
CREATE TABLE IF NOT EXISTS system_configurations (
    id SERIAL PRIMARY KEY,
    durasi_istirahat_sistem INT NOT NULL DEFAULT 30,
    durasi_pompa_on INT NOT NULL DEFAULT 15,
    tambahan_waktu INT NOT NULL DEFAULT 15,
    max_perulangan INT NOT NULL DEFAULT 3,

    -- Sensor Calibration Offsets
    offset_temp REAL NOT NULL DEFAULT 0.0,
    offset_tds REAL NOT NULL DEFAULT 0.0,
    offset_ph REAL NOT NULL DEFAULT 0.0,
    offset_wl REAL NOT NULL DEFAULT 0.0,

    -- Temperature Thresholds
    enable_temp BOOLEAN NOT NULL DEFAULT TRUE,
    safe_temp_min REAL NOT NULL DEFAULT 26.0,
    safe_temp_max REAL NOT NULL DEFAULT 30.0,
    warn_temp_min1 REAL NOT NULL DEFAULT 24.0,
    warn_temp_max1 REAL NOT NULL DEFAULT 26.0,
    warn_temp_min2 REAL NOT NULL DEFAULT 30.0,
    warn_temp_max2 REAL NOT NULL DEFAULT 32.0,
    danger_temp_min1 REAL NOT NULL DEFAULT 0.0,
    danger_temp_max1 REAL NOT NULL DEFAULT 24.0,
    danger_temp_min2 REAL NOT NULL DEFAULT 32.0,
    danger_temp_max2 REAL NOT NULL DEFAULT 50.0,

    -- TDS Thresholds
    enable_tds BOOLEAN NOT NULL DEFAULT TRUE,
    safe_tds_min REAL NOT NULL DEFAULT 100.0,
    safe_tds_max REAL NOT NULL DEFAULT 300.0,
    warn_tds_min1 REAL NOT NULL DEFAULT 0.0,
    warn_tds_max1 REAL NOT NULL DEFAULT 100.0,
    warn_tds_min2 REAL NOT NULL DEFAULT 300.0,
    warn_tds_max2 REAL NOT NULL DEFAULT 500.0,
    danger_tds_min1 REAL NOT NULL DEFAULT 500.0,
    danger_tds_max1 REAL NOT NULL DEFAULT 1500.0,

    -- pH Thresholds
    enable_ph BOOLEAN NOT NULL DEFAULT TRUE,
    safe_ph_min REAL NOT NULL DEFAULT 6.5,
    safe_ph_max REAL NOT NULL DEFAULT 8.5,
    warn_ph_min1 REAL NOT NULL DEFAULT 5.5,
    warn_ph_max1 REAL NOT NULL DEFAULT 6.5,
    warn_ph_min2 REAL NOT NULL DEFAULT 8.5,
    warn_ph_max2 REAL NOT NULL DEFAULT 9.0,
    danger_ph_min1 REAL NOT NULL DEFAULT 0.0,
    danger_ph_max1 REAL NOT NULL DEFAULT 5.5,
    danger_ph_min2 REAL NOT NULL DEFAULT 9.0,
    danger_ph_max2 REAL NOT NULL DEFAULT 14.0,

    -- Water Level Thresholds
    enable_wl BOOLEAN NOT NULL DEFAULT TRUE,
    safe_wl_min REAL NOT NULL DEFAULT 70.0,
    safe_wl_max REAL NOT NULL DEFAULT 100.0,
    warn_wl_min REAL NOT NULL DEFAULT 50.0,
    warn_wl_max REAL NOT NULL DEFAULT 70.0,
    danger_wl_min REAL NOT NULL DEFAULT 0.0,
    danger_wl_max REAL NOT NULL DEFAULT 50.0,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial row if not present
INSERT INTO system_configurations (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;


-- 3. Actuator Audit Logs Table
CREATE TABLE IF NOT EXISTS actuator_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actuator_name VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    triggered_by VARCHAR(50) NOT NULL DEFAULT 'USER_MANUAL',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actuator_logs_created_at 
ON actuator_audit_logs (created_at DESC);


-- 4. Automation Cycles Table
CREATE TABLE IF NOT EXISTS automation_cycles (
    id SERIAL PRIMARY KEY,
    cycle_number INT NOT NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'berjalan',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_cycles_start_time 
ON automation_cycles (start_time DESC);


-- 5. Automation Cycle Logs Table
CREATE TABLE IF NOT EXISTS automation_cycle_logs (
    id BIGSERIAL PRIMARY KEY,
    cycle_id INT NOT NULL REFERENCES automation_cycles(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL,
    overall_status VARCHAR(20),
    avg_temperature REAL,
    temperature_status VARCHAR(20),
    avg_tds REAL,
    tds_status VARCHAR(20),
    avg_ph REAL,
    ph_status VARCHAR(20),
    avg_water_level REAL,
    water_level_status VARCHAR(20),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cycle_logs_cycle_id 
ON automation_cycle_logs (cycle_id, logged_at ASC);


-- 6. System Alerts Table
CREATE TABLE IF NOT EXISTS system_alerts (
    id BIGSERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    sensor_name VARCHAR(50),
    severity_level VARCHAR(20) NOT NULL DEFAULT 'Peringatan',
    value REAL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_created_at 
ON system_alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_alerts_unread 
ON system_alerts (is_read, created_at DESC);
