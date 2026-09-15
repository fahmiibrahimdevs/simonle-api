import { ENV } from '../config/env';
import { logger } from '../utils/logger';

export async function sendTelegramNotification(messageHtml: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN || '8819697781:AAHHbg7V8qr2sxvZPWW7-zllgkbh235XHOY';
  const chatId = process.env.TELEGRAM_CHAT_ID || '2018459980';

  if (!token || !chatId) {
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const resJson = (await response.json()) as any;
    if (!resJson.ok) {
      logger.error('Failed to send Telegram notification', resJson);
      return false;
    }
    return true;
  } catch (error) {
    logger.error('Error sending Telegram notification', error);
    return false;
  }
}
