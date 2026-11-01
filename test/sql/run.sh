#!/bin/bash
# FinalVault database behaviour tests (v1.6.0 invoicing).
#
# Builds throwaway databases on a LOCAL Postgres (16+), applies a stub of the
# live Supabase schema plus migrations 107 onward, then runs the checks
# in this folder. Each check prints "ok ..."; the first failure stops that
# file with "FAIL ...". Never point this at the live database.
#
# Usage, from the repo root:
#   test/sql/run.sh
# Connection comes from the usual PG* variables (PGHOST, PGPORT, PGUSER);
# the user needs CREATEDB and CREATEROLE.

set -u
cd "$(dirname "$0")/../.."
STUB=test/sql/000_stub_live_schema.sql
failures=0

# fresh_db NAME [migration-to-skip]
fresh_db() {
  local db=$1 skip=${2:-}
  dropdb --if-exists "$db" >/dev/null 2>&1
  createdb "$db" || exit 1
  for f in "$STUB" sql/1*.sql; do
    # Only the invoicing migrations (107 on) are covered by the stub.
    local n; n=$(basename "$f"); n=${n:0:3}
    if [ "$f" != "$STUB" ] && [ "$((10#$n))" -lt 107 ]; then continue; fi
    if [ -n "$skip" ] && [[ "$f" == *"$skip"* ]]; then continue; fi
    psql -d "$db" -v ON_ERROR_STOP=1 -q -o /dev/null -f "$f" || { echo "FAILED applying $f"; exit 1; }
  done
}

# run_check DB FILE
run_check() {
  echo "── $2"
  if ! psql -d "$1" -v ON_ERROR_STOP=1 -q -f "test/sql/$2" 2>&1; then failures=$((failures + 1)); fi
}

fresh_db fvtest_a && run_check fvtest_a 200_invoice_tests.sql
fresh_db fvtest_b && run_check fvtest_b 210_save_invoice_tests.sql
fresh_db fvtest_c && run_check fvtest_c 220_invoice_template_tests.sql && run_check fvtest_c 230_mobile_nav_tests.sql
# The money migration test runs 114 itself, on data made before it.
fresh_db fvtest_d 114_ && run_check fvtest_d 240_session_money_migration_tests.sql
fresh_db fvtest_e && run_check fvtest_e 250_portal_invoice_tests.sql
fresh_db fvtest_f && run_check fvtest_f 260_invoice_email_tests.sql
fresh_db fvtest_g && run_check fvtest_g 270_booking_invoice_tests.sql

for db in fvtest_a fvtest_b fvtest_c fvtest_d fvtest_e fvtest_f fvtest_g; do dropdb --if-exists "$db" >/dev/null 2>&1; done

if [ "$failures" -gt 0 ]; then echo "$failures test file(s) failed"; exit 1; fi
echo "All database checks passed"
