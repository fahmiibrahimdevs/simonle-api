import { SystemConfigEntity } from '../types';

interface TelemetryCache {
  timestamp: string;
  temperature: number;
  tds: number;
  ph: number;
  water_level: number;
  pompa_inlet: string;
  pompa_outlet: string;
  bv_open: string;
  bv_close: string;
  last_updated: string;
  is_online: boolean;
}

class CacheService {
  private latestTelemetry: TelemetryCache = {
    timestamp: new Date().toISOString(),
    temperature: 0,
    tds: 0,
    ph: 0,
    water_level: 0,
    pompa_inlet: 'OFF',
    pompa_outlet: 'OFF',
    bv_open: 'OFF',
    bv_close: 'OFF',
    last_updated: new Date().toISOString(),
    is_online: false,
  };

  private lastTelemetryReceivedMs: number = 0;
  private activeConfig: SystemConfigEntity | null = null;
  private mqttConnected: boolean = false;

  public updateTelemetry(data: Partial<TelemetryCache>) {
    this.latestTelemetry = {
      ...this.latestTelemetry,
      ...data,
      last_updated: new Date().toISOString(),
    };
    this.lastTelemetryReceivedMs = Date.now();
  }

  public getLatestTelemetry() {
    const isOnline = Date.now() - this.lastTelemetryReceivedMs < 15000;
    return {
      ...this.latestTelemetry,
      is_online: isOnline,
    };
  }

  public setMqttConnected(connected: boolean) {
    this.mqttConnected = connected;
  }

  public isMqttConnected(): boolean {
    return this.mqttConnected;
  }

  public getActiveConfig(): SystemConfigEntity | null {
    return this.activeConfig;
  }

  public setActiveConfig(config: SystemConfigEntity) {
    this.activeConfig = config;
  }
}

export const cacheService = new CacheService();
