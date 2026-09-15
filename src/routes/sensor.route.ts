import { Hono } from 'hono';
import ExcelJS from 'exceljs';
import { cacheService } from '../services/cache.service';
import { dbQueries } from '../db/queries';
import { ApiResponse } from '../types';
import { logger } from '../utils/logger';

export const sensorRoutes = new Hono();

/**
 * GET /api/sensors/realtime
 * Instant snapshot from RAM Cache (< 1ms)
 */
sensorRoutes.get('/realtime', (c) => {
  const telemetry = cacheService.getLatestTelemetry();
  return c.json<ApiResponse>({
    success: true,
    message: 'Realtime sensor data retrieved',
    data: telemetry,
    meta: {
      last_updated: telemetry.last_updated,
      is_online: telemetry.is_online,
      mqtt_connected: cacheService.isMqttConnected(),
    },
  });
});

/**
 * GET /api/sensors/history
 * Telemetry historical points for FlChart & Data Table
 */
sensorRoutes.get('/history', async (c) => {
  try {
    const range = c.req.query('range') || '24h';
    const startDate = c.req.query('start_date');
    const endDate = c.req.query('end_date');
    const limit = parseInt(c.req.query('limit') || '1000', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const result = await dbQueries.getTelemetryHistory({
      range,
      startDate,
      endDate,
      limit,
      offset,
    });

    return c.json<ApiResponse>({
      success: true,
      message: `Retrieved ${result.data.length} telemetry records for range "${range}"`,
      data: result.data,
      meta: result.meta,
    });
  } catch (error: any) {
    logger.error('Error fetching sensor history', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to retrieve sensor history',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * GET /api/sensors/export/count
 * Count total records between startDate and endDate
 */
sensorRoutes.get('/export/count', async (c) => {
  try {
    const startDate = c.req.query('startDate') || c.req.query('start_date');
    const endDate = c.req.query('endDate') || c.req.query('end_date');

    const count = await dbQueries.getTelemetryExportCount(startDate, endDate);
    return c.json({ count });
  } catch (error: any) {
    logger.error('Error counting export records', error);
    return c.json({ count: 0, error: error.message }, 500);
  }
});

/**
 * GET /api/sensors/export/csv
 * Export telemetry to CSV format
 */
sensorRoutes.get('/export/csv', async (c) => {
  try {
    const sensorsParam = c.req.query('sensors') || 'water_level,temperature,tds,ph';
    const sensors = sensorsParam.split(',').map((s) => s.trim());
    const startDate = c.req.query('startDate') || c.req.query('start_date');
    const endDate = c.req.query('endDate') || c.req.query('end_date');

    const rows = await dbQueries.getTelemetryExportData({ sensors, startDate, endDate });

    // Build CSV Headers
    const headers = ['Timestamp'];
    if (sensors.includes('water_level')) headers.push('Level Air (%)');
    if (sensors.includes('temperature')) headers.push('Suhu Air (°C)');
    if (sensors.includes('tds')) headers.push('TDS (PPM)');
    if (sensors.includes('ph')) headers.push('pH Air');

    const lines: string[] = [headers.join(',')];

    for (const r of rows) {
      const line = [r.created_at];
      if (sensors.includes('water_level')) line.push(r.water_level.toString());
      if (sensors.includes('temperature')) line.push(r.temperature.toString());
      if (sensors.includes('tds')) line.push(r.tds.toString());
      if (sensors.includes('ph')) line.push(r.ph.toString());
      lines.push(line.join(','));
    }

    const csvContent = lines.join('\r\n');
    const filename = `simonle_export_${new Date().toISOString().slice(0, 10)}.csv`;

    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.text(csvContent);
  } catch (error: any) {
    logger.error('Error generating CSV export', error);
    return c.text('Failed to generate CSV export', 500);
  }
});

/**
 * GET /api/sensors/export/excel
 * Export telemetry to Excel (.xlsx) format
 */
sensorRoutes.get('/export/excel', async (c) => {
  try {
    const sensorsParam = c.req.query('sensors') || 'water_level,temperature,tds,ph';
    const sensors = sensorsParam.split(',').map((s) => s.trim());
    const startDate = c.req.query('startDate') || c.req.query('start_date');
    const endDate = c.req.query('endDate') || c.req.query('end_date');

    const rows = await dbQueries.getTelemetryExportData({ sensors, startDate, endDate });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SIMONLE System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Data Telemetri');

    const columns: any[] = [{ header: 'Timestamp (WIB)', key: 'timestamp', width: 25 }];
    if (sensors.includes('water_level')) columns.push({ header: 'Level Air (%)', key: 'water_level', width: 15 });
    if (sensors.includes('temperature')) columns.push({ header: 'Suhu Air (°C)', key: 'temperature', width: 15 });
    if (sensors.includes('tds')) columns.push({ header: 'TDS (PPM)', key: 'tds', width: 15 });
    if (sensors.includes('ph')) columns.push({ header: 'pH Air', key: 'ph', width: 15 });

    worksheet.columns = columns;

    // Header styling
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' },
    };

    for (const r of rows) {
      const rowData: any = { timestamp: r.created_at };
      if (sensors.includes('water_level')) rowData.water_level = r.water_level;
      if (sensors.includes('temperature')) rowData.temperature = r.temperature;
      if (sensors.includes('tds')) rowData.tds = r.tds;
      if (sensors.includes('ph')) rowData.ph = r.ph;
      worksheet.addRow(rowData);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `simonle_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(buffer as any);
  } catch (error: any) {
    logger.error('Error generating Excel export', error);
    return c.text('Failed to generate Excel export', 500);
  }
});
