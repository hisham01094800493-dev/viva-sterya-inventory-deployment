#!/usr/bin/env bash
# تطبيق الترحيلات على قاعدة البيانات بأمان: فحص مسبق -> نسخة احتياطية -> ترحيل -> تحقق.
#
# الاستخدام:
#   DATABASE_URL="mysql://user:pass@host:port/db" CONFIRM=yes bash scripts/apply-migrations.sh
#
# بدون CONFIRM=yes السكربت يتوقف بعد الفحص المسبق والنسخة الاحتياطية فقط (وضع المعاينة).
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL غير مضبوط." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_FILE="${BACKUP_DIR}/backup_before_migrations_${STAMP}.sql"
mkdir -p "$BACKUP_DIR"

echo "════════════════════════════════════════════"
echo " 1/4  فحص مسبق (قراءة فقط)"
echo "════════════════════════════════════════════"
node scripts/preflight-migrations.mjs

echo
echo "════════════════════════════════════════════"
echo " 2/4  نسخة احتياطية"
echo "════════════════════════════════════════════"
if ! command -v mysqldump >/dev/null 2>&1; then
  echo "❌ mysqldump غير مثبّت. ثبّته قبل المتابعة (apt-get install mysql-client)." >&2
  exit 1
fi
node scripts/backup-mysql.mjs "$BACKUP_FILE"
echo "✅ النسخة الاحتياطية: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

if [[ "${CONFIRM:-}" != "yes" ]]; then
  echo
  echo "⏸️  وضع المعاينة فقط. لم يُطبَّق أي ترحيل."
  echo "    للمتابعة أعد التشغيل مع: CONFIRM=yes"
  exit 0
fi

echo
echo "════════════════════════════════════════════"
echo " 3/4  تطبيق الترحيلات (بالترتيب من السجل)"
echo "════════════════════════════════════════════"
pnpm db:migrate

echo
echo "════════════════════════════════════════════"
echo " 4/4  تحقق بعد التطبيق"
echo "════════════════════════════════════════════"
node scripts/preflight-migrations.mjs

echo
echo "✅ انتهى. راجع القسم 5 (الخلاصة) أعلاه للتأكد من أن 0037 و0038 و0039 مطبّقة."
