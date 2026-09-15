import mqtt, { MqttClient } from 'mqtt';
import { ENV } from '../config/env';
import { logger } from '../utils/logger';
import { cacheService } from './cache.service';
import { dbQueries } from '../db/queries';
import { SensorTelemetryEntity } from '../types';

class MqttService {
  private client: MqttClient | null = null;
  private telemetryBuffer: SensorTelemetryEntity[] = [];
  private flushIntervalTimer: NodeJS.Timeout | null = null;

  public init() {
    logger.info(`Connecting to MQTT broker at ${ENV.MQTT_BROKER_URL}...`);

    this.client = mqtt.connect(ENV.MQTT_BROKER_URL, {
      clientId: `${ENV.MQTT_CLIENT_ID}_${Math.random().toString(16).substring(2, 8)}`,
      username: ENV.MQTT_USERNAME,
      password: ENV.MQTT_PASSWORD,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    });

    this.client.on('connect', () => {
      logger.info('Connected to MQTT Broker successfully!');
      cacheService.setMqttConnected(true);

      const topics = [
        'simonle/demak/sensor',
        'simonle/demak/pompa',
        'simonle/demak/automation',
        'simonle/demak/alert',
        'simonle/demak/ballvalve',
      ];

      this.client?.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          logger.error('Failed to subscribe to MQTT topics', err);
        } else {
          logger.info(`Subscribed to topics: ${topics.join(', ')}`);
        }
      });
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload.toString());
    });

    this.client.on('error', (err) => {
      logger.error('MQTT Client Error', err);
    });

    this.client.on('offline', () => {
      logger.warn('MQTT Client went offline');
      cacheService.setMqttConnected(false);
    });

    this.client.on('reconnect', () => {
      logger.warn('Reconnecting to MQTT Broker...');
    });

    // Start 10-second batch flush timer for telemetry database insertion
    this.flushIntervalTimer = setInterval(() => {
      this.flushTelemetryBuffer();
    }, 10000);
  }

  private handleMessage(topic: string, payloadStr: string) {
    try {
      const data = JSON.parse(payloadStr);

      if (topic === 'simonle/demak/sensor') {
        // 1. Update In-Memory RAM Cache (Instant real-time access)
        cacheService.updateTelemetry({
          timestamp: data.timestamp || new Date().toISOString(),
          temperature: parseFloat(data.temperature ?? 0),
          tds: parseFloat(data.tds ?? 0),
          ph: parseFloat(data.ph ?? 0),
          water_level: parseFloat(data.water_level ?? 0),
          pompa_inlet: data.pompa_inlet || 'OFF',
          pompa_outlet: data.pompa_outlet || 'OFF',
          bv_open: data.bv_open || 'OFF',
          bv_close: data.bv_close || 'OFF',
        });

        // 2. Buffer for Batch Write to PostgreSQL
        this.telemetryBuffer.push({
          temperature: parseFloat(data.temperature ?? 0),
          tds: parseFloat(data.tds ?? 0),
          ph: parseFloat(data.ph ?? 0),
          water_level: parseFloat(data.water_level ?? 0),
          created_at: data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString(),
        });

        if (this.telemetryBuffer.length >= 10) {
          this.flushTelemetryBuffer();
        }
      } else if (topic === 'simonle/demak/alert') {
        logger.warn(`System Alert received via MQTT: ${data.message || data.type}`, data);
        dbQueries.insertSystemAlert({
          type: data.type || 'sensor_alert',
          sensor_name: data.sensor || data.sensor_name || 'water_level',
          severity_level: data.level || 'Peringatan',
          value: parseFloat(data.value ?? 0),
          message: data.message || 'Peringatan sistem terdeteksi',
        }).catch((err) => logger.error('Failed to store MQTT alert', err));
      } else if (topic === 'simonle/demak/automation') {
        dbQueries.saveAutomationCycleState(data).catch((err) =>
          logger.error('Failed to store automation cycle state', err)
        );
      } else if (topic === 'simonle/demak/pompa') {
        cacheService.updateTelemetry({
          pompa_inlet: data.pompa_inlet,
          pompa_outlet: data.pompa_outlet,
        });
      } else if (topic === 'simonle/demak/ballvalve') {
        cacheService.updateTelemetry({
          bv_open: data.bv_open,
          bv_close: data.bv_close,
        });
      }
    } catch (e) {
      logger.error(`Error parsing message on ${topic}: ${payloadStr}`, e);
    }
  }

  private async flushTelemetryBuffer() {
    if (this.telemetryBuffer.length === 0) return;

    const toInsert = [...this.telemetryBuffer];
    this.telemetryBuffer = [];

    try {
      const count = await dbQueries.insertTelemetryBatch(toInsert);
      // Optional debug log
      // logger.info(`Flushed ${count} telemetry records to database.`);
    } catch (error) {
      logger.error('Failed to flush telemetry batch, requeueing...', error);
      // Re-add to buffer if failed
      this.telemetryBuffer.unshift(...toInsert);
    }
  }

  public async publish(topic: string, payload: any, retain: boolean = false): Promise<void> {
    if (!this.client || !this.client.connected) {
      throw new Error('MQTT client is not connected to broker');
    }

    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      this.client!.publish(topic, payloadStr, { qos: 1, retain }, (err) => {
        if (err) {
          logger.error(`Failed to publish message to [${topic}]`, err);
          reject(err);
        } else {
          logger.info(`Published MQTT Message to [${topic}] (retained: ${retain}) | ${payloadStr}`);
          resolve();
        }
      });
    });
  }
}

export const mqttService = new MqttService();
