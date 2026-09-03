CREATE TABLE IF NOT EXISTS api_idempotency(
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(idempotency_key, method, path)
);

CREATE TABLE IF NOT EXISTS strategy_runtime_state(
  strategy_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK(state IN ('running', 'paused')),
  reason TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_runs(
  run_id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  request_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  data_timestamp TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(run_type, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_paper_orders_account_status
  ON paper_orders(account_id, status);

CREATE INDEX IF NOT EXISTS idx_api_idempotency_created_at
  ON api_idempotency(created_at);
