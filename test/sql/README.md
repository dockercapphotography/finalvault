# Database behaviour tests

These checks cover the invoicing rules that live in the database (migrations 107 onward). They test totals and rounding, the rule that a schedule must add up to the total, locking after a payment, numbering, templates, the session-money migration (114), portal invoice data, email logging and booking invoices. They also test who can read and change what: app users, anonymous visitors and the service role.

They run on a **local** Postgres, never on Supabase. `000_stub_live_schema.sql` stands in for the parts of the live schema that the migrations touch. The script builds throwaway databases, applies the stub and migrations 107 onward, runs each file, and drops the databases again.

```
test/sql/run.sh
```

Run it from the repo root. You need Postgres 16+ with its contrib extensions (for `pgcrypto`), and a user that can create databases and roles. Connection details come from the usual `PGHOST` / `PGPORT` / `PGUSER` variables.

Each check prints `ok …`. A failing check prints `FAIL …` and stops that file, and the script exits non-zero.

When a new migration changes a live table the stub doesn't have yet, add that table's columns to the stub. Copy them from the live schema; don't guess.
