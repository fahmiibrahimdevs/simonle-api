import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'production',

  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: parseInt(process.env.DB_PORT || '5432', 10),
  DB_USER: process.env.DB_USER || 'simonle_user',
  DB_PASSWORD: process.env.DB_PASSWORD || 'simonle_2026',
  DB_NAME: process.env.DB_NAME || 'simonle_db',

  MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://103.197.188.199:1883',
  MQTT_CLIENT_ID: process.env.MQTT_CLIENT_ID || 'simonle_backend_service',
  MQTT_USERNAME: process.env.MQTT_USERNAME || 'nexaryn',
  MQTT_PASSWORD: process.env.MQTT_PASSWORD || '31750321',

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '8819697781:AAHHbg7V8qr2sxvZPWW7-zllgkbh235XHOY',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '2018459980',
};
