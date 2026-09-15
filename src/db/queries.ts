import { pool } from '../config/database';
import { logger } from '../utils/logger';
import {
  SensorTelemetryEntity,
  SystemConfigEntity,
  ActuatorLogEntity,
  AutomationCycleEntity,
  SystemAlertEntity,
} from '../types';

export const dbQueries = {
  /**
   * Batch insert telemetry readings into PostgreSQL.
   * Uses Multi-row INSERT to reduce CPU and disk I/O.
   */
  insertTelemetryBatch: async (readings: SensorTelemetryEntity[]): Promise<number> => {
    if (!readings || readings.length === 0) return 0;

    const valueRows: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const r of readings) {
      valueRows.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
      params.push(r.temperature, r.tds, r.ph, r.water_level, r.created_at || new Date().toISOString());
    }

    const query = `
      INSERT INTO sensor_telemetries (temperature, tds, ph, water_level, created_at)
      VALUES ${valueRows.join(',\n')}
    `;

    try {
      const res = await pool.query(query, params);
      return res.rowCount || readings.length;
    } catch (error) {
      logger.error('Failed to execute insertTelemetryBatch', error);
      throw error;
    }
  },

  /**
   * Get Telemetry history for Charts & Tables with dynamic SQL Downsampling / Aggregation
   */
  getTelemetryHistory: async (options: {
    range?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    const range = options.range || '24h';
    const limit = Math.min(options.limit || 1000, 5000);
    const offset = options.offset || 0;

    let timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    if (options.startDate && options.endDate) {
      timeFilter = `created_at >= '${options.startDate}' AND created_at <= '${options.endDate}'`;
    } else if (range === '1h') {
      timeFilter = "created_at >= NOW() - INTERVAL '1 hour'";
    } else if (range === '24h') {
      timeFilter = "created_at >= NOW() - INTERVAL '24 hours'";
    } else if (range === '7d') {
      timeFilter = "created_at >= NOW() - INTERVAL '7 days'";
    } else if (range === '30d') {
      timeFilter = "created_at >= NOW() - INTERVAL '30 days'";
    } else if (range === '90d') {
      timeFilter = "created_at >= NOW() - INTERVAL '90 days'";
    }

    try {
      // 1. Check total count
      const countRes = await pool.query(`
        SELECT COUNT(*) as total
        FROM sensor_telemetries
        WHERE ${timeFilter}
      `);
      const totalRecords = parseInt(countRes.rows[0]?.total || '0', 10);

      let dataQuery = '';

      // For 7d: aggregate per hour
      if (range === '7d' && !options.startDate) {
        dataQuery = `
          SELECT 
            date_trunc('hour', created_at) as created_at,
            ROUND(AVG(temperature)::numeric, 1)::real as temperature,
            ROUND(AVG(tds)::numeric, 1)::real as tds,
            ROUND(AVG(ph)::numeric, 1)::real as ph,
            ROUND(AVG(water_level)::numeric, 1)::real as water_level
          FROM sensor_telemetries
          WHERE ${timeFilter}
          GROUP BY date_trunc('hour', created_at)
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      // For 30d and 90d: aggregate per day
      else if ((range === '30d' || range === '90d') && !options.startDate) {
        dataQuery = `
          SELECT 
            date_trunc('day', created_at) as created_at,
            ROUND(AVG(temperature)::numeric, 1)::real as temperature,
            ROUND(AVG(tds)::numeric, 1)::real as tds,
            ROUND(AVG(ph)::numeric, 1)::real as ph,
            ROUND(AVG(water_level)::numeric, 1)::real as water_level
          FROM sensor_telemetries
          WHERE ${timeFilter}
          GROUP BY date_trunc('day', created_at)
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      // For 1h, 24h, or specific date range: fetch records ordered by created_at DESC
      else {
        dataQuery = `
          SELECT 
            id,
            ROUND(temperature::numeric, 1)::real as temperature,
            ROUND(tds::numeric, 1)::real as tds,
            ROUND(ph::numeric, 1)::real as ph,
            ROUND(water_level::numeric, 1)::real as water_level,
            created_at
          FROM sensor_telemetries
          WHERE ${timeFilter}
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }

      const res = await pool.query(dataQuery);
      const rows = res.rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));

      const hasMore = offset + rows.length < totalRecords;

      return {
        data: rows,
        meta: {
          total_records: totalRecords,
          has_more: hasMore,
          limit,
          offset,
          range_applied: range,
          start_date: options.startDate || null,
          end_date: options.endDate || null,
        },
      };
    } catch (error) {
      logger.error('Failed to get telemetry history', error);
      throw error;
    }
  },

  /**
   * Count records matching date range for Export Data modal
   */
  getTelemetryExportCount: async (startDate?: string, endDate?: string): Promise<number> => {
    let whereClause = '1=1';
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      whereClause += ` AND created_at >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      whereClause += ` AND created_at <= $${params.length}`;
    }

    try {
      const res = await pool.query(`SELECT COUNT(*) as count FROM sensor_telemetries WHERE ${whereClause}`, params);
      return parseInt(res.rows[0]?.count || '0', 10);
    } catch (error) {
      logger.error('Failed to count export records', error);
      throw error;
    }
  },

  /**
   * Fetch telemetries for CSV / Excel export
   */
  getTelemetryExportData: async (options: {
    sensors: string[];
    startDate?: string;
    endDate?: string;
  }) => {
    let whereClause = '1=1';
    const params: any[] = [];

    if (options.startDate) {
      params.push(options.startDate);
      whereClause += ` AND created_at >= $${params.length}`;
    }
    if (options.endDate) {
      params.push(options.endDate);
      whereClause += ` AND created_at <= $${params.length}`;
    }

    const query = `
      SELECT 
        id,
        created_at,
        ROUND(temperature::numeric, 1)::real as temperature,
        ROUND(tds::numeric, 1)::real as tds,
        ROUND(ph::numeric, 1)::real as ph,
        ROUND(water_level::numeric, 1)::real as water_level
      FROM sensor_telemetries
      WHERE ${whereClause}
      ORDER BY created_at ASC
    `;

    try {
      const res = await pool.query(query, params);
      return res.rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));
    } catch (error) {
      logger.error('Failed to fetch export telemetries', error);
      throw error;
    }
  },

  /**
   * Get Active System Configurations
   */
  getSystemConfig: async (): Promise<SystemConfigEntity> => {
    try {
      const res = await pool.query('SELECT * FROM system_configurations WHERE id = 1 LIMIT 1');
      if (res.rows.length === 0) {
        await pool.query('INSERT INTO system_configurations (id) VALUES (1) ON CONFLICT DO NOTHING');
        const retry = await pool.query('SELECT * FROM system_configurations WHERE id = 1 LIMIT 1');
        return retry.rows[0];
      }
      return res.rows[0];
    } catch (error) {
      logger.error('Failed to fetch system configurations', error);
      throw error;
    }
  },

  /**
   * Update System Configurations (Dynamic partial update)
   */
  updateSystemConfig: async (config: Partial<SystemConfigEntity>): Promise<SystemConfigEntity> => {
    const keys = Object.keys(config).filter((k) => k !== 'id' && k !== 'updated_at');
    if (keys.length === 0) {
      return dbQueries.getSystemConfig();
    }

    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of keys) {
      setClauses.push(`"${key}" = $${idx++}`);
      values.push((config as any)[key]);
    }

    setClauses.push('updated_at = NOW()');

    const query = `
      UPDATE system_configurations
      SET ${setClauses.join(', ')}
      WHERE id = 1
      RETURNING *;
    `;

    try {
      const res = await pool.query(query, values);
      return res.rows[0];
    } catch (error) {
      logger.error('Failed to update system configurations', error);
      throw error;
    }
  },

  /**
   * Save Actuator Audit Log
   */
  insertActuatorLog: async (log: ActuatorLogEntity): Promise<ActuatorLogEntity> => {
    const query = `
      INSERT INTO actuator_audit_logs (actuator_name, action, triggered_by, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING *;
    `;
    try {
      const res = await pool.query(query, [log.actuator_name, log.action, log.triggered_by || 'USER_MANUAL']);
      return res.rows[0];
    } catch (error) {
      logger.error('Failed to insert actuator log', error);
      throw error;
    }
  },

  /**
   * Retrieve Actuator Audit Logs
   */
  getActuatorLogs: async (limit: number = 50): Promise<ActuatorLogEntity[]> => {
    const query = `
      SELECT * FROM actuator_audit_logs
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    try {
      const res = await pool.query(query, [limit]);
      return res.rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));
    } catch (error) {
      logger.error('Failed to get actuator logs', error);
      throw error;
    }
  },

  /**
   * Retrieve Automation Cycles with nested cycle logs
   */
  getAutomationCycles: async (limit: number = 10, offset: number = 0, date?: string) => {
    let whereClause = '1=1';
    const params: any[] = [];

    if (date) {
      params.push(date);
      whereClause += ` AND DATE(c.start_time AT TIME ZONE 'Asia/Jakarta') = $${params.length}`;
    }

    params.push(limit);
    const limitParam = `$${params.length}`;
    params.push(offset);
    const offsetParam = `$${params.length}`;

    try {
      const countRes = await pool.query(`SELECT COUNT(*) as total FROM automation_cycles c WHERE ${whereClause}`);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      const query = `
        SELECT 
          c.id,
          c.cycle_number,
          c.start_time,
          c.end_time,
          c.status,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', l.id,
                  'cycle_id', l.cycle_id,
                  'event_type', l.event_type,
                  'overall_status', l.overall_status,
                  'avg_temperature', CASE WHEN l.avg_temperature IS NOT NULL THEN ROUND(l.avg_temperature::numeric, 1)::real ELSE NULL END,
                  'temperature_status', l.temperature_status,
                  'avg_tds', CASE WHEN l.avg_tds IS NOT NULL THEN ROUND(l.avg_tds::numeric, 1)::real ELSE NULL END,
                  'tds_status', l.tds_status,
                  'avg_ph', CASE WHEN l.avg_ph IS NOT NULL THEN ROUND(l.avg_ph::numeric, 1)::real ELSE NULL END,
                  'ph_status', l.ph_status,
                  'avg_water_level', CASE WHEN l.avg_water_level IS NOT NULL THEN ROUND(l.avg_water_level::numeric, 1)::real ELSE NULL END,
                  'water_level_status', l.water_level_status,
                  'logged_at', l.logged_at
                ) ORDER BY l.logged_at ASC, l.id ASC
              )
              FROM automation_cycle_logs l
              WHERE l.cycle_id = c.id
            ), '[]'::json
          ) as logs
        FROM automation_cycles c
        WHERE ${whereClause}
        ORDER BY c.start_time DESC
        LIMIT ${limitParam} OFFSET ${offsetParam};
      `;

      const res = await pool.query(query, params);
      const rows = res.rows.map((r) => ({
        ...r,
        start_time: r.start_time instanceof Date ? r.start_time.toISOString() : r.start_time,
        end_time: r.end_time instanceof Date ? r.end_time.toISOString() : r.end_time,
      }));

      return {
        data: rows,
        meta: {
          total,
          has_more: offset + rows.length < total,
          limit,
          offset,
        },
      };
    } catch (error) {
      logger.error('Failed to fetch automation cycles', error);
      throw error;
    }
  },

  /**
   * Save incoming Automation cycle from MQTT or API
   */
  saveAutomationCycleState: async (payload: any) => {
    try {
      const cycleNumber = parseInt(String(payload.cycle_number || payload.label || '1').replace(/\D/g, '') || '1', 10);
      const status = String(payload.status || 'berjalan').toLowerCase();

      // Check for active cycle or latest cycle today
      const findRes = await pool.query(
        `SELECT id, status FROM automation_cycles 
         WHERE cycle_number = $1 AND DATE(start_time AT TIME ZONE 'Asia/Jakarta') = CURRENT_DATE 
         ORDER BY id DESC LIMIT 1`,
        [cycleNumber]
      );

      let cycleId: number;
      if (findRes.rows.length > 0) {
        cycleId = findRes.rows[0].id;
        const endTime = status === 'selesai' ? 'NOW()' : 'NULL';
        await pool.query(
          `UPDATE automation_cycles SET status = $1, end_time = ${endTime} WHERE id = $2`,
          [status, cycleId]
        );
      } else {
        const insRes = await pool.query(
          `INSERT INTO automation_cycles (cycle_number, status, start_time) 
           VALUES ($1, $2, NOW()) RETURNING id`,
          [cycleNumber, status]
        );
        cycleId = insRes.rows[0].id;
      }

      // If logs array is provided, sync logs
      const rawLogs = payload.logs || payload.log || [];
      if (Array.isArray(rawLogs) && rawLogs.length > 0) {
        // Clear previous logs for this cycle to avoid duplicate entries on re-publish
        await pool.query('DELETE FROM automation_cycle_logs WHERE cycle_id = $1', [cycleId]);

        for (const item of rawLogs) {
          const eventType = item.event_type || item.tipe || 'cek_sensor';
          const overallStatus = item.overall_status || item.status_keseluruhan || 'normal';

          let avgTemp = null, tempStat = null;
          let avgTds = null, tdsStat = null;
          let avgPh = null, phStat = null;
          let avgWl = null, wlStat = null;

          if (item.sensor_avg) {
            avgTemp = item.sensor_avg.suhu?.nilai;
            tempStat = item.sensor_avg.suhu?.status;
            avgTds = item.sensor_avg.tds?.nilai;
            tdsStat = item.sensor_avg.tds?.status;
            avgPh = item.sensor_avg.ph?.nilai;
            phStat = item.sensor_avg.ph?.status;
            avgWl = item.sensor_avg.water_level?.nilai;
            wlStat = item.sensor_avg.water_level?.status;
          } else {
            avgTemp = item.avg_temperature;
            tempStat = item.temperature_status;
            avgTds = item.avg_tds;
            tdsStat = item.tds_status;
            avgPh = item.avg_ph;
            phStat = item.ph_status;
            avgWl = item.avg_water_level;
            wlStat = item.water_level_status;
          }

          await pool.query(
            `INSERT INTO automation_cycle_logs 
              (cycle_id, event_type, overall_status, avg_temperature, temperature_status, avg_tds, tds_status, avg_ph, ph_status, avg_water_level, water_level_status, logged_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
            [cycleId, eventType, overallStatus, avgTemp, tempStat, avgTds, tdsStat, avgPh, phStat, avgWl, wlStat]
          );
        }
      }
    } catch (error) {
      logger.error('Failed to save automation cycle state', error);
    }
  },

  /**
   * System Alerts Queries
   */
  getSystemAlerts: async (unreadOnly: boolean = false, limit: number = 50, offset: number = 0) => {
    let whereClause = '1=1';
    if (unreadOnly) {
      whereClause += ' AND is_read = FALSE';
    }

    try {
      const countRes = await pool.query(`SELECT COUNT(*) as total FROM system_alerts WHERE ${whereClause}`);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      const query = `
        SELECT * FROM system_alerts
        WHERE ${whereClause}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2;
      `;
      const res = await pool.query(query, [limit, offset]);
      const rows = res.rows.map((r) => ({
        ...r,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      }));

      return {
        data: rows,
        meta: {
          total,
          has_more: offset + rows.length < total,
          limit,
          offset,
        },
      };
    } catch (error) {
      logger.error('Failed to get system alerts', error);
      throw error;
    }
  },

  insertSystemAlert: async (alert: Partial<SystemAlertEntity>) => {
    const query = `
      INSERT INTO system_alerts (type, sensor_name, severity_level, value, message, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
      RETURNING *;
    `;
    try {
      const res = await pool.query(query, [
        alert.type || 'sensor_alert',
        alert.sensor_name || null,
        alert.severity_level || 'Peringatan',
        alert.value || null,
        alert.message || 'Alert Sistem Terdeteksi',
      ]);
      return res.rows[0];
    } catch (error) {
      logger.error('Failed to insert system alert', error);
      throw error;
    }
  },

  markAlertAsRead: async (id: number | string): Promise<boolean> => {
    try {
      const res = await pool.query('UPDATE system_alerts SET is_read = TRUE WHERE id = $1', [id]);
      return (res.rowCount || 0) > 0;
    } catch (error) {
      logger.error(`Failed to mark alert ${id} as read`, error);
      throw error;
    }
  },

  markAllAlertsAsRead: async (): Promise<boolean> => {
    try {
      await pool.query('UPDATE system_alerts SET is_read = TRUE WHERE is_read = FALSE');
      return true;
    } catch (error) {
      logger.error('Failed to mark all alerts as read', error);
      throw error;
    }
  },
};
