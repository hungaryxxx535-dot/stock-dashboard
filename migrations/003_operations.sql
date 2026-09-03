CREATE TABLE IF NOT EXISTS scheduler_runs(
  run_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, trade_date TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, attempts INTEGER NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, error_type TEXT, error_message TEXT
);
CREATE TABLE IF NOT EXISTS message_deliveries(
  dedup_key TEXT PRIMARY KEY, message_kind TEXT NOT NULL, data_cutoff TEXT NOT NULL,
  model_version TEXT NOT NULL, status TEXT NOT NULL, chunks_sent INTEGER NOT NULL,
  attempts INTEGER NOT NULL, created_at TEXT NOT NULL, finished_at TEXT,
  error_type TEXT, error_message TEXT
);

