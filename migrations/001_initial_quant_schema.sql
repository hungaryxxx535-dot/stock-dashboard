CREATE TABLE IF NOT EXISTS securities_master(
  symbol TEXT NOT NULL, name TEXT NOT NULL, exchange TEXT NOT NULL, board TEXT NOT NULL,
  security_type TEXT NOT NULL, listing_date TEXT NOT NULL, delisting_date TEXT,
  valid_from TEXT NOT NULL, valid_to TEXT, source TEXT NOT NULL,
  PRIMARY KEY(symbol, valid_from)
);
CREATE TABLE IF NOT EXISTS listing_history(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, status TEXT NOT NULL, announced_at TEXT, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS delisting_history(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, status TEXT NOT NULL, announced_at TEXT, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS risk_warning_history(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, status TEXT NOT NULL, announced_at TEXT, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS suspension_history(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, status TEXT NOT NULL, announced_at TEXT, source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_risk_interval ON risk_warning_history(symbol,effective_from,effective_to);
CREATE INDEX IF NOT EXISTS idx_suspension_interval ON suspension_history(symbol,effective_from,effective_to);
CREATE TABLE IF NOT EXISTS daily_bars(
  symbol TEXT NOT NULL, trade_date TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL,
  low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, amount REAL NOT NULL,
  prev_close REAL, adjusted TEXT NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL,
  data_version TEXT NOT NULL, PRIMARY KEY(symbol,trade_date,adjusted,source)
);
CREATE TABLE IF NOT EXISTS minute_bars(symbol TEXT NOT NULL, bar_time TEXT NOT NULL, open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, volume REAL NOT NULL, amount REAL NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL, data_version TEXT NOT NULL, PRIMARY KEY(symbol,bar_time,source));
CREATE TABLE IF NOT EXISTS adjustment_factors(symbol TEXT NOT NULL, effective_date TEXT NOT NULL, factor REAL NOT NULL, source TEXT NOT NULL, fetched_at TEXT NOT NULL, data_version TEXT NOT NULL, PRIMARY KEY(symbol,effective_date,source));
CREATE TABLE IF NOT EXISTS trading_calendar(exchange TEXT NOT NULL, trade_date TEXT NOT NULL, is_open INTEGER NOT NULL, previous_trade_date TEXT, next_trade_date TEXT, source TEXT NOT NULL, PRIMARY KEY(exchange,trade_date));
CREATE TABLE IF NOT EXISTS price_limit_rules(id INTEGER PRIMARY KEY, board TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, risk_status TEXT, limit_up_pct REAL, limit_down_pct REAL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS corporate_actions(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, action_type TEXT NOT NULL, ex_date TEXT NOT NULL, record_date TEXT, pay_date TEXT, ratio REAL, cash_amount REAL, announced_at TEXT NOT NULL, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS announcements(announcement_id TEXT PRIMARY KEY, symbol TEXT NOT NULL, title TEXT NOT NULL, published_at TEXT NOT NULL, url TEXT, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS financial_release_dates(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, report_period TEXT NOT NULL, published_at TEXT NOT NULL, statement_type TEXT NOT NULL, source TEXT NOT NULL, UNIQUE(symbol,report_period,statement_type,source));
CREATE TABLE IF NOT EXISTS industry_membership_history(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, industry_code TEXT NOT NULL, industry_name TEXT NOT NULL, classification TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, announced_at TEXT, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS index_membership_history(id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, index_code TEXT NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, announced_at TEXT, source TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data_quality_log(id INTEGER PRIMARY KEY, dataset TEXT NOT NULL, symbol TEXT, trade_date TEXT, severity TEXT NOT NULL, check_name TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS data_sync_runs(run_id TEXT PRIMARY KEY, provider TEXT NOT NULL, endpoint TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL, requested_range TEXT, row_count INTEGER NOT NULL DEFAULT 0, data_version TEXT, error_type TEXT, error_message TEXT);

