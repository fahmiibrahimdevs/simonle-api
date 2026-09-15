import { Hono } from 'hono';
import { dbQueries } from '../db/queries';
import { mqttService } from '../services/mqtt.service';
import { ApiResponse, ActuatorLogEntity } from '../types';
import { logger } from '../utils/logger';

export const actuatorRoutes = new Hono();

/**
 * GET /api/actuators/logs
 * Retrieve actuator audit logs
 */
actuatorRoutes.get('/logs', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '50', 10);
    const logs = await dbQueries.getActuatorLogs(limit);

    return c.json<ApiResponse<ActuatorLogEntity[]>>({
      success: true,
      message: 'Actuator logs retrieved',
      data: logs,
    });
  } catch (error: any) {
    logger.error('Failed to get actuator logs', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to retrieve actuator logs',
        error: error.message || String(error),
      },
      500
    );
  }
});

/**
 * POST /api/actuators/control
 * Send manual switch command to NodeMCU via MQTT and record audit log
 */
actuatorRoutes.post('/control', async (c) => {
  try {
    const body = await c.req.json<{ actuator?: string; action?: string }>();
    const { actuator, action } = body;

    const validActuators = ['pompa_inlet', 'pompa_outlet', 'bv_open', 'bv_close'];
    const validActions = ['ON', 'OFF'];

    if (!actuator || !validActuators.includes(actuator)) {
      return c.json<ApiResponse>(
        {
          success: false,
          message: `Invalid actuator. Must be one of: ${validActuators.join(', ')}`,
        },
        400
      );
    }

    if (!action || !validActions.includes(action.toUpperCase())) {
      return c.json<ApiResponse>(
        {
          success: false,
          message: 'Invalid action. Must be ON or OFF',
        },
        400
      );
    }

    const actionUpper = action.toUpperCase();

    // 1. Publish to MQTT broker
    let topic = 'simonle/demak/pompa';
    let payload: any = {};

    if (actuator === 'pompa_inlet' || actuator === 'pompa_outlet') {
      topic = 'simonle/demak/pompa';
      payload = { [actuator]: actionUpper };
    } else if (actuator === 'bv_open' || actuator === 'bv_close') {
      topic = 'simonle/demak/ballvalve';
      payload = { [actuator]: actionUpper };
    }

    await mqttService.publish(topic, payload, true);

    // 2. Save audit log to PostgreSQL
    const auditLog = await dbQueries.insertActuatorLog({
      actuator_name: actuator,
      action: actionUpper,
      triggered_by: 'USER_MANUAL',
    });

    logger.info(`Actuator Control Executed: ${actuator} -> ${actionUpper}`);

    return c.json<ApiResponse>({
      success: true,
      message: `Successfully sent ${actionUpper} command to ${actuator}`,
      data: {
        actuator,
        action: actionUpper,
        topic,
        audit_id: auditLog.id,
      },
    });
  } catch (error: any) {
    logger.error('Failed to execute actuator control', error);
    return c.json<ApiResponse>(
      {
        success: false,
        message: 'Failed to control actuator',
        error: error.message || String(error),
      },
      500
    );
  }
});
