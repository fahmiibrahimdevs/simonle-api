#!/bin/bash
# ==============================================================================
# SIMONLE Automated Daily Database Backup to Telegram
# Executed daily at 00:00 WIB via Linux Cron Job
# ==============================================================================

set -e

BOT_TOKEN="8819697781:AAHHbg7V8qr2sxvZPWW7-zllgkbh235XHOY"
CHAT_ID="2018459980"
BACKUP_DIR="/home/simonle/backups"
DB_HOST="127.0.0.1"
DB_PORT="5432"
DB_USER="simonle_user"
DB_PASS="simonle_2026"
DB_NAME="simonle_db"

export TZ="Asia/Jakarta"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DATE_READABLE=$(date +"%d %b %Y, %H:%M WIB")
FILENAME="simonle_db_backup_${TIMESTAMP}.sql.gz"
FILEPATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "${BACKUP_DIR}"

if PGPASSWORD="${DB_PASS}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" | gzip > "${FILEPATH}"; then
    FILE_SIZE=$(du -h "${FILEPATH}" | awk '{print $1}')
    TOTAL_TELEMETRY=$(PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "SELECT COUNT(*) FROM sensor_telemetries;" 2>/dev/null || echo "0")
    TOTAL_CYCLES=$(PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "SELECT COUNT(*) FROM automation_cycles;" 2>/dev/null || echo "0")
    TOTAL_ALERTS=$(PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -A -c "SELECT COUNT(*) FROM system_alerts;" 2>/dev/null || echo "0")

    CAPTION="📦 <b>SIMONLE - Backup Database Harian</b>%0A━━━━━━━━━━━━━━━━━━━━%0A📅 <b>Waktu:</b> ${DATE_READABLE}%0A🗄️ <b>Database:</b> PostgreSQL 16 (${DB_NAME})%0A📊 <b>Total Telemetri:</b> ${TOTAL_TELEMETRY} baris%0A🤖 <b>Siklus Otomasi:</b> ${TOTAL_CYCLES} siklus%0A🚨 <b>Total Alert:</b> ${TOTAL_ALERTS} peringatan%0A📁 <b>Ukuran:</b> ${FILE_SIZE} (.sql.gz)%0A✅ <b>Status:</b> Backup Berhasil Terkompresi"

    curl -s -F chat_id="${CHAT_ID}" \
            -F document=@"${FILEPATH}" \
            -F caption="${CAPTION}" \
            -F parse_mode="HTML" \
            "https://api.telegram.org/bot${BOT_TOKEN}/sendDocument" > /dev/null

    echo "[$(date)] SUCCESS: Backup ${FILENAME} sent to Telegram"

    find "${BACKUP_DIR}" -name "simonle_db_backup_*.sql.gz" -type f -mtime +7 -delete

else
    ERR_MSG="⚠️ <b>PERINGATAN: Backup Database SIMONLE Gagal!</b>%0A%0AWaktu: ${DATE_READABLE}%0AServer: VPS (139.190.96.208)%0AMohon periksa PostgreSQL di server segera."
    curl -s "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${ERR_MSG}&parse_mode=HTML" > /dev/null
    echo "[$(date)] ERROR: Backup failed!"
    exit 1
fi
