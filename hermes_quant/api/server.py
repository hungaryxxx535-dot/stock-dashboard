from __future__ import annotations

import hashlib
import hmac
import json
import logging
import threading
import time
import uuid
from collections import defaultdict, deque
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from hermes_quant.config import Settings
from hermes_quant.data.repository import QuantRepository
from hermes_quant.paper.models import FeeSchedule, OrderStatus


LOGGER = logging.getLogger("hermes_quant.api")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
MAX_BODY_BYTES = 1_000_000
TERMINAL_ORDER_STATES = {
    OrderStatus.FILLED.value,
    OrderStatus.CANCELLED.value,
    OrderStatus.REJECTED.value,
    OrderStatus.EXPIRED.value,
}


class ApiError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _json_hash(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_timestamp(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ApiError("INVALID_TIMESTAMP", f"{field} must be ISO-8601") from exc
    if parsed.tzinfo is None:
        raise ApiError("INVALID_TIMESTAMP", f"{field} must include a timezone")
    return parsed


def validate_json_schema(value: Any, schema: dict[str, Any], path: str = "$" ) -> None:
    """Validate the strict JSON-schema subset used by the bridge contracts."""
    expected = schema.get("type")
    type_map = {
        "object": dict,
        "array": list,
        "string": str,
        "integer": int,
        "number": (int, float),
        "boolean": bool,
    }
    if expected in type_map:
        valid = isinstance(value, type_map[expected]) and not (
            expected in {"integer", "number"} and isinstance(value, bool)
        )
        if not valid:
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} must be {expected}", 422)
    if "enum" in schema and value not in schema["enum"]:
        raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} must be one of {schema['enum']}", 422)
    if isinstance(value, dict):
        required = schema.get("required", [])
        missing = [key for key in required if key not in value]
        if missing:
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} missing required fields: {', '.join(missing)}", 422)
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            unexpected = sorted(set(value) - set(properties))
            if unexpected:
                raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} has unexpected fields: {', '.join(unexpected)}", 422)
        for key, child in value.items():
            if key in properties:
                validate_json_schema(child, properties[key], f"{path}.{key}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} has too few items", 422)
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} has too many items", 422)
        item_schema = schema.get("items")
        if item_schema:
            for index, child in enumerate(value):
                validate_json_schema(child, item_schema, f"{path}[{index}]")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} is too short", 422)
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} is too long", 422)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} is below minimum", 422)
        if "maximum" in schema and value > schema["maximum"]:
            raise ApiError("SCHEMA_VALIDATION_FAILED", f"{path} is above maximum", 422)


EMPTY_OBJECT_SCHEMA = {"type": "object", "properties": {}, "additionalProperties": False}
CANDIDATE_SCHEMA = {
    "type": "object",
    "properties": {
        "trade_date": {"type": "string", "minLength": 10, "maxLength": 10},
        "max_candidates": {"type": "integer", "minimum": 0, "maximum": 3},
    },
    "required": ["trade_date"],
    "additionalProperties": False,
}
AUCTION_SCHEMA = {
    "type": "object",
    "properties": {
        "trade_date": {"type": "string", "minLength": 10, "maxLength": 10},
        "candidate_symbols": {
            "type": "array",
            "maxItems": 3,
            "items": {"type": "string", "minLength": 6, "maxLength": 6},
        },
    },
    "required": ["trade_date", "candidate_symbols"],
    "additionalProperties": False,
}
ORDER_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "account_id": {"type": "string", "minLength": 1, "maxLength": 64},
        "strategy_id": {"type": "string", "minLength": 1, "maxLength": 128},
        "model_version": {"type": "string", "minLength": 1, "maxLength": 128},
        "symbol": {"type": "string", "minLength": 6, "maxLength": 6},
        "side": {"type": "string", "enum": ["BUY", "SELL"]},
        "order_type": {"type": "string", "enum": ["LIMIT"]},
        "signal_time": {"type": "string", "minLength": 10, "maxLength": 64},
        "quantity": {"type": "integer", "minimum": 100, "maximum": 100_000_000},
        "limit_price": {"type": "number", "minimum": 0.01, "maximum": 100_000},
    },
    "required": [
        "account_id", "strategy_id", "model_version", "symbol", "side",
        "order_type", "signal_time", "quantity", "limit_price",
    ],
    "additionalProperties": False,
}
ORDERS_SCHEMA = {
    "type": "object",
    "properties": {"orders": {"type": "array", "minItems": 1, "maxItems": 20, "items": ORDER_ITEM_SCHEMA}},
    "required": ["orders"],
    "additionalProperties": False,
}
STRATEGY_STATE_SCHEMA = {
    "type": "object",
    "properties": {"reason": {"type": "string", "maxLength": 500}},
    "additionalProperties": False,
}


class RateLimiter:
    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, identity: str) -> None:
        now = time.monotonic()
        with self._lock:
            events = self._events[identity]
            while events and events[0] <= now - 60:
                events.popleft()
            if len(events) >= self.per_minute:
                raise ApiError("RATE_LIMITED", "request rate limit exceeded", 429)
            events.append(now)


class QuantApiService:
    def __init__(self, settings: Settings, repository: QuantRepository, model_version: str = "champion-v1") -> None:
        if settings.execution_mode != "paper":
            raise RuntimeError("quant API refuses non-paper environments")
        self.settings = settings
        self.repository = repository
        self.model_version = model_version
        self.fees = FeeSchedule()
        self._lock = threading.RLock()
        self.repository.migrate(Path(__file__).resolve().parents[2] / "migrations")
        self._ensure_default_accounts()

    def _ensure_default_accounts(self) -> None:
        now = _utc_now().isoformat()
        accounts = (
            ("champion", "Hermes Champion", "champion", "champion-v1"),
            ("equal_weight", "Equal Weight", "benchmark", "equal-weight-v1"),
            ("random", "Random", "benchmark", "random-v1"),
            ("benchmark", "Index Benchmark", "benchmark", "index-v1"),
            ("challenger", "Challenger", "challenger", "challenger-v1"),
        )
        with self.repository.transaction() as connection:
            connection.executemany(
                """INSERT OR IGNORE INTO paper_accounts(
                    account_id,name,role,initial_cash,available_cash,frozen_cash,model_version,created_at
                ) VALUES(?,?,?,?,?,?,?,?)""",
                [(account_id, name, role, 1_000_000.0, 1_000_000.0, 0.0, version, now) for account_id, name, role, version in accounts],
            )

    def _quality(self) -> tuple[str | None, list[str], dict[str, Any]]:
        with self.repository.session() as connection:
            row = connection.execute("SELECT MAX(trade_date) AS ts, COUNT(*) AS bars FROM daily_bars").fetchone()
            source_rows = connection.execute("""
                SELECT source FROM daily_bars
                UNION SELECT source FROM minute_bars
                UNION SELECT source FROM announcements
                UNION SELECT source FROM industry_membership_history
                ORDER BY source
            """).fetchall()
            security_count = connection.execute("SELECT COUNT(DISTINCT symbol) FROM securities_master").fetchone()[0]
            daily_symbol_count = connection.execute("SELECT COUNT(DISTINCT symbol) FROM daily_bars").fetchone()[0]
            minute_count = connection.execute("SELECT COUNT(*) FROM minute_bars").fetchone()[0]
            minute_symbol_count = connection.execute("SELECT COUNT(DISTINCT symbol) FROM minute_bars").fetchone()[0]
            announcement_count = connection.execute("SELECT COUNT(*) FROM announcements").fetchone()[0]
            announcement_symbol_count = connection.execute("SELECT COUNT(DISTINCT symbol) FROM announcements").fetchone()[0]
            industry_count = connection.execute("SELECT COUNT(*) FROM industry_membership_history").fetchone()[0]
            industry_symbol_count = connection.execute("SELECT COUNT(DISTINCT symbol) FROM industry_membership_history").fetchone()[0]
            quality_errors = connection.execute("SELECT COUNT(*) FROM data_quality_log WHERE severity='error'").fetchone()[0]
        data_timestamp = f"{row['ts']}T15:00:00+08:00" if row and row["ts"] else None
        sources = [item[0] for item in source_rows]
        gaps = []
        if daily_symbol_count < security_count:
            gaps.append("daily_full_market_coverage_partial")
        if minute_count == 0:
            gaps.append("minute_data_missing")
        elif minute_symbol_count < security_count:
            gaps.append("minute_full_market_coverage_partial")
        gaps.append("auction_order_book_data_missing")
        if announcement_count == 0:
            gaps.append("announcements_missing")
        elif announcement_symbol_count < security_count:
            gaps.append("announcement_window_is_scoped")
        if industry_count == 0:
            gaps.append("historical_industry_missing")
        elif industry_symbol_count < security_count:
            gaps.append("industry_full_market_coverage_partial")
        quality = {
            "status": "degraded" if gaps or quality_errors else "healthy",
            "security_count": security_count,
            "daily_symbol_count": daily_symbol_count,
            "daily_bar_count": row["bars"] if row else 0,
            "daily_symbol_coverage": round(daily_symbol_count / security_count, 6) if security_count else 0,
            "minute_bar_count": minute_count,
            "minute_symbol_count": minute_symbol_count,
            "minute_symbol_coverage": round(minute_symbol_count / security_count, 6) if security_count else 0,
            "announcement_count": announcement_count,
            "announcement_symbol_count": announcement_symbol_count,
            "industry_membership_count": industry_count,
            "industry_symbol_count": industry_symbol_count,
            "quality_error_count": quality_errors,
            "gaps": gaps,
            "uses_test_fixture": False,
        }
        return data_timestamp, sources, quality

    def envelope(
        self,
        request_id: str,
        run_id: str,
        *,
        data: Any = None,
        success: bool = True,
        error_code: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        data_timestamp, sources, quality = self._quality()
        return {
            "request_id": request_id,
            "run_id": run_id,
            "model_version": self.model_version,
            "environment": "paper",
            "data_timestamp": data_timestamp,
            "data_sources": sources,
            "data_quality": quality,
            "success": success,
            "error_code": error_code,
            "error_message": error_message,
            "data": data,
        }

    def dispatch(
        self,
        method: str,
        path: str,
        body: dict[str, Any],
        request_id: str,
        idempotency_key: str | None,
    ) -> dict[str, Any]:
        run_id = str(uuid.uuid4())
        if method == "POST":
            if not idempotency_key:
                raise ApiError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required", 400)
            if len(idempotency_key) > 128:
                raise ApiError("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key is too long", 400)
            cached = self._get_idempotent(idempotency_key, method, path, body)
            if cached is not None:
                return cached

        if method == "GET" and path == "/health":
            result = self.envelope(request_id, run_id, data={"status": "ok", "bind": "loopback", "database": "ready"})
        elif method == "GET" and path == "/system/status":
            result = self._system_status(request_id, run_id)
        elif method == "GET" and path == "/market/regime":
            result = self.envelope(request_id, run_id, data={"regime": "unknown", "reason": "no validated regime model output"})
        elif method == "GET" and path == "/paper/account":
            result = self.envelope(request_id, run_id, data=self._account("champion"))
        elif method == "GET" and path == "/paper/positions":
            result = self.envelope(request_id, run_id, data={"positions": self._positions("champion")})
        elif method == "GET" and path == "/paper/orders":
            result = self.envelope(request_id, run_id, data={"orders": self._orders("champion")})
        elif method == "GET" and path == "/reports/daily":
            result = self.envelope(request_id, run_id, data=self._report(1))
        elif method == "GET" and path == "/reports/weekly":
            result = self.envelope(request_id, run_id, data=self._report(7))
        elif method == "GET" and path == "/models/status":
            result = self.envelope(request_id, run_id, data=self._models())
        elif method == "POST" and path == "/candidates/premarket":
            validate_json_schema(body, CANDIDATE_SCHEMA)
            result = self._premarket(body, request_id, run_id)
        elif method == "POST" and path == "/candidates/auction-review":
            validate_json_schema(body, AUCTION_SCHEMA)
            result = self._auction_review(body, request_id, run_id)
        elif method == "POST" and path == "/paper/orders":
            validate_json_schema(body, ORDERS_SCHEMA)
            result = self.envelope(request_id, run_id, data={"orders": self._create_orders(body["orders"])})
        elif method == "POST" and path.startswith("/paper/orders/") and path.endswith("/cancel"):
            validate_json_schema(body, EMPTY_OBJECT_SCHEMA)
            order_id = path[len("/paper/orders/"):-len("/cancel")]
            if not order_id:
                raise ApiError("NOT_FOUND", "order not found", 404)
            result = self.envelope(request_id, run_id, data={"order": self._cancel_order(order_id)})
        elif method == "POST" and path.startswith("/strategies/") and path.endswith(("/pause", "/resume")):
            validate_json_schema(body, STRATEGY_STATE_SCHEMA)
            suffix = "/pause" if path.endswith("/pause") else "/resume"
            strategy_id = path[len("/strategies/"):-len(suffix)]
            result = self.envelope(request_id, run_id, data=self._set_strategy_state(strategy_id, suffix == "/pause", body.get("reason")))
        else:
            raise ApiError("NOT_FOUND", "endpoint not found", 404)

        if method == "POST" and idempotency_key:
            self._save_idempotent(idempotency_key, method, path, body, result)
        return result

    def _get_idempotent(self, key: str, method: str, path: str, body: Any) -> dict[str, Any] | None:
        request_hash = _json_hash(body)
        with self.repository.session() as connection:
            row = connection.execute(
                "SELECT request_hash,response_json FROM api_idempotency WHERE idempotency_key=? AND method=? AND path=?",
                (key, method, path),
            ).fetchone()
        if not row:
            return None
        if row["request_hash"] != request_hash:
            raise ApiError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with a different request", 409)
        return json.loads(row["response_json"])

    def _save_idempotent(self, key: str, method: str, path: str, body: Any, response: dict[str, Any]) -> None:
        with self.repository.transaction() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO api_idempotency(idempotency_key,method,path,request_hash,response_json,created_at) VALUES(?,?,?,?,?,?)",
                (key, method, path, _json_hash(body), json.dumps(response, ensure_ascii=False), _utc_now().isoformat()),
            )

    def _system_status(self, request_id: str, run_id: str) -> dict[str, Any]:
        with self.repository.session() as connection:
            migrations = [row[0] for row in connection.execute("SELECT version FROM schema_migrations ORDER BY version")]
            scheduler = [dict(row) for row in connection.execute("SELECT job_id,trade_date,status,attempts FROM scheduler_runs ORDER BY started_at DESC LIMIT 20")]
        return self.envelope(
            request_id,
            run_id,
            data={
                "execution_mode": "paper",
                "real_broker_connected": False,
                "real_order_submission_available": False,
                "scheduler_enabled": self.settings.scheduler_enabled,
                "migrations": migrations,
                "recent_scheduler_runs": scheduler,
            },
        )

    def _account(self, account_id: str) -> dict[str, Any]:
        with self.repository.session() as connection:
            row = connection.execute("SELECT * FROM paper_accounts WHERE account_id=?", (account_id,)).fetchone()
            if not row:
                raise ApiError("ACCOUNT_NOT_FOUND", "paper account not found", 404)
            market_value = connection.execute(
                "SELECT COALESCE(SUM(quantity * average_cost),0) FROM paper_positions WHERE account_id=?", (account_id,)
            ).fetchone()[0]
        result = dict(row)
        result["market_value_at_cost"] = market_value
        result["total_equity_at_cost"] = result["available_cash"] + market_value
        result["environment"] = "paper"
        return result

    def _positions(self, account_id: str) -> list[dict[str, Any]]:
        with self.repository.session() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM paper_positions WHERE account_id=? ORDER BY symbol", (account_id,))]

    def _orders(self, account_id: str) -> list[dict[str, Any]]:
        with self.repository.session() as connection:
            return [dict(row) for row in connection.execute("SELECT * FROM paper_orders WHERE account_id=? ORDER BY submit_time DESC", (account_id,))]

    def _create_orders(self, requested: list[dict[str, Any]]) -> list[dict[str, Any]]:
        created: list[dict[str, Any]] = []
        now = _utc_now()
        with self._lock, self.repository.transaction() as connection:
            for item in requested:
                signal_time = _parse_timestamp(item["signal_time"], "signal_time")
                account = connection.execute("SELECT * FROM paper_accounts WHERE account_id=?", (item["account_id"],)).fetchone()
                if not account:
                    raise ApiError("ACCOUNT_NOT_FOUND", f"paper account {item['account_id']} not found", 404)
                strategy = connection.execute("SELECT state FROM strategy_runtime_state WHERE strategy_id=?", (item["strategy_id"],)).fetchone()
                rejection: str | None = None
                frozen = 0.0
                if strategy and strategy["state"] == "paused":
                    rejection = "STRATEGY_PAUSED"
                elif item["quantity"] % self.fees.lot_size:
                    rejection = "INVALID_LOT_SIZE"
                elif signal_time > now + timedelta(seconds=5):
                    rejection = "SIGNAL_TIME_IN_FUTURE"
                elif item["side"] == "BUY":
                    gross = float(item["limit_price"]) * int(item["quantity"])
                    frozen = gross + max(gross * self.fees.commission_rate, self.fees.minimum_commission)
                    if frozen > float(account["available_cash"]) - float(account["frozen_cash"]) + 1e-9:
                        rejection = "INSUFFICIENT_CASH"
                else:
                    position = connection.execute(
                        "SELECT sellable_quantity FROM paper_positions WHERE account_id=? AND symbol=?",
                        (item["account_id"], item["symbol"]),
                    ).fetchone()
                    if not position or int(position["sellable_quantity"]) < int(item["quantity"]):
                        rejection = "T1_OR_POSITION_LIMIT"
                status = OrderStatus.REJECTED.value if rejection else OrderStatus.ACCEPTED.value
                order_id = str(uuid.uuid4())
                connection.execute(
                    """INSERT INTO paper_orders(
                        order_id,account_id,strategy_id,model_version,symbol,side,order_type,signal_time,submit_time,
                        limit_price,requested_quantity,filled_quantity,average_fill_price,remaining_quantity,
                        commission,tax,slippage,status,rejection_reason,data_timestamp
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        order_id, item["account_id"], item["strategy_id"], item["model_version"], item["symbol"],
                        item["side"], item["order_type"], signal_time.isoformat(), now.isoformat(), item["limit_price"],
                        item["quantity"], 0, 0.0, item["quantity"], 0.0, 0.0, 0.0, status, rejection, None,
                    ),
                )
                if not rejection and item["side"] == "BUY":
                    connection.execute("UPDATE paper_accounts SET frozen_cash=frozen_cash+? WHERE account_id=?", (frozen, item["account_id"]))
                created.append({"order_id": order_id, "status": status, "rejection_reason": rejection})
        return created

    def _cancel_order(self, order_id: str) -> dict[str, Any]:
        with self._lock, self.repository.transaction() as connection:
            row = connection.execute("SELECT * FROM paper_orders WHERE order_id=?", (order_id,)).fetchone()
            if not row:
                raise ApiError("ORDER_NOT_FOUND", "paper order not found", 404)
            if row["status"] not in TERMINAL_ORDER_STATES:
                if row["side"] == "BUY":
                    remaining_gross = float(row["limit_price"]) * int(row["remaining_quantity"])
                    release = remaining_gross + max(remaining_gross * self.fees.commission_rate, self.fees.minimum_commission)
                    connection.execute(
                        "UPDATE paper_accounts SET frozen_cash=MAX(0,frozen_cash-?) WHERE account_id=?",
                        (release, row["account_id"]),
                    )
                connection.execute("UPDATE paper_orders SET status=? WHERE order_id=?", (OrderStatus.CANCELLED.value, order_id))
            result = connection.execute("SELECT * FROM paper_orders WHERE order_id=?", (order_id,)).fetchone()
        return dict(result)

    def _set_strategy_state(self, strategy_id: str, paused: bool, reason: str | None) -> dict[str, Any]:
        if not strategy_id or len(strategy_id) > 128:
            raise ApiError("INVALID_STRATEGY_ID", "invalid strategy id", 422)
        state = "paused" if paused else "running"
        with self.repository.transaction() as connection:
            connection.execute(
                """INSERT INTO strategy_runtime_state(strategy_id,state,reason,updated_at) VALUES(?,?,?,?)
                   ON CONFLICT(strategy_id) DO UPDATE SET state=excluded.state,reason=excluded.reason,updated_at=excluded.updated_at""",
                (strategy_id, state, reason, _utc_now().isoformat()),
            )
        return {"strategy_id": strategy_id, "state": state, "reason": reason}

    def _premarket(self, body: dict[str, Any], request_id: str, run_id: str) -> dict[str, Any]:
        try:
            trade_date = date.fromisoformat(body["trade_date"])
        except ValueError as exc:
            raise ApiError("INVALID_TRADE_DATE", "trade_date must be YYYY-MM-DD", 422) from exc
        maximum = body.get("max_candidates", 3)
        with self.repository.session() as connection:
            rows = connection.execute("SELECT COUNT(DISTINCT symbol) FROM daily_bars WHERE trade_date<=?", (trade_date.isoformat(),)).fetchone()[0]
        data = {
            "trade_date": trade_date.isoformat(),
            "candidates": [],
            "candidate_count": 0,
            "max_candidates": maximum,
            "decision": "hold_cash",
            "reason": "no validated candidate-generation strategy is active" if rows else "historical daily data unavailable",
        }
        self._store_candidate_run(run_id, "premarket", trade_date, body, data)
        return self.envelope(request_id, run_id, data=data)

    def _auction_review(self, body: dict[str, Any], request_id: str, run_id: str) -> dict[str, Any]:
        try:
            trade_date = date.fromisoformat(body["trade_date"])
        except ValueError as exc:
            raise ApiError("INVALID_TRADE_DATE", "trade_date must be YYYY-MM-DD", 422) from exc
        with self.repository.session() as connection:
            count = connection.execute("SELECT COUNT(*) FROM minute_bars WHERE bar_time LIKE ?", (f"{trade_date.isoformat()}%",)).fetchone()[0]
        if count == 0:
            raise ApiError("AUCTION_DATA_UNAVAILABLE", "real 09:25 auction data is unavailable; all candidates must remain cancelled", 422)
        data = {"trade_date": trade_date.isoformat(), "approved": [], "cancelled": body["candidate_symbols"], "reason": "no validated auction-review strategy is active"}
        self._store_candidate_run(run_id, "auction_review", trade_date, body, data)
        return self.envelope(request_id, run_id, data=data)

    def _store_candidate_run(self, run_id: str, kind: str, trade_date: date, request: Any, result: Any) -> None:
        data_timestamp, _, _ = self._quality()
        with self.repository.transaction() as connection:
            connection.execute(
                "INSERT OR REPLACE INTO candidate_runs(run_id,run_type,trade_date,request_json,result_json,data_timestamp,created_at) VALUES(?,?,?,?,?,?,?)",
                (run_id, kind, trade_date.isoformat(), json.dumps(request, ensure_ascii=False), json.dumps(result, ensure_ascii=False), data_timestamp, _utc_now().isoformat()),
            )

    def _report(self, days: int) -> dict[str, Any]:
        cutoff = (_utc_now() - timedelta(days=days)).isoformat()
        with self.repository.session() as connection:
            order_counts = [dict(row) for row in connection.execute(
                "SELECT status,COUNT(*) AS count FROM paper_orders WHERE submit_time>=? GROUP BY status ORDER BY status", (cutoff,)
            )]
            messages = [dict(row) for row in connection.execute(
                "SELECT status,COUNT(*) AS count FROM message_deliveries WHERE created_at>=? GROUP BY status ORDER BY status", (cutoff,)
            )]
        return {"period_days": days, "account": self._account("champion"), "order_counts": order_counts, "message_delivery_counts": messages}

    def _models(self) -> dict[str, Any]:
        with self.repository.session() as connection:
            models = [dict(row) for row in connection.execute("SELECT * FROM model_registry ORDER BY created_at DESC")]
            states = [dict(row) for row in connection.execute("SELECT * FROM strategy_runtime_state ORDER BY strategy_id")]
        return {"active_model_version": self.model_version, "automatic_champion_promotion": False, "models": models, "strategy_states": states}


class QuantApiServer:
    def __init__(self, settings: Settings, repository: QuantRepository | None = None, host: str | None = None, port: int | None = None) -> None:
        if not settings.api_token or len(settings.api_token) < 16:
            raise RuntimeError("HERMES_QUANT_API_TOKEN must be configured with at least 16 characters")
        bind_host = host or settings.api_host
        if bind_host not in LOOPBACK_HOSTS:
            raise RuntimeError("quant API may only bind to loopback")
        self.settings = settings
        self.repository = repository or QuantRepository(settings.database_path)
        self.service = QuantApiService(settings, self.repository)
        self.rate_limiter = RateLimiter(settings.api_rate_limit_per_minute)
        self._token = settings.api_token
        self._log_path = settings.database_path.parent / "logs" / "quant_api.jsonl"
        self._log_path.parent.mkdir(parents=True, exist_ok=True)
        handler = self._handler_class()
        self.httpd = ThreadingHTTPServer((bind_host, settings.api_port if port is None else port), handler)
        self.httpd.daemon_threads = True

    @property
    def address(self) -> tuple[str, int]:
        host, port = self.httpd.server_address[:2]
        return str(host), int(port)

    def _handler_class(self) -> type[BaseHTTPRequestHandler]:
        outer = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "HermesQuantLoopback/1"
            sys_version = ""

            def log_message(self, format: str, *args: Any) -> None:
                return

            def do_GET(self) -> None:  # noqa: N802
                self._dispatch("GET")

            def do_POST(self) -> None:  # noqa: N802
                self._dispatch("POST")

            def _dispatch(self, method: str) -> None:
                started = time.monotonic()
                request_id = self.headers.get("X-Request-Id") or str(uuid.uuid4())
                path = urlsplit(self.path).path
                status = 200
                try:
                    authorization = self.headers.get("Authorization", "")
                    expected = f"Bearer {outer._token}"
                    if not hmac.compare_digest(authorization, expected):
                        raise ApiError("UNAUTHORIZED", "valid bearer token required", 401)
                    outer.rate_limiter.check(hashlib.sha256(outer._token.encode("utf-8")).hexdigest())
                    body: dict[str, Any] = {}
                    if method == "POST":
                        length = int(self.headers.get("Content-Length", "0"))
                        if length <= 0 or length > MAX_BODY_BYTES:
                            raise ApiError("INVALID_BODY", "JSON body is required and must be below 1 MB", 400)
                        try:
                            decoded = json.loads(self.rfile.read(length).decode("utf-8"))
                        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                            raise ApiError("INVALID_JSON", "request body must be valid UTF-8 JSON", 400) from exc
                        if not isinstance(decoded, dict):
                            raise ApiError("INVALID_BODY", "request body must be a JSON object", 400)
                        body = decoded
                    payload = outer.service.dispatch(
                        method,
                        path,
                        body,
                        request_id,
                        self.headers.get("Idempotency-Key"),
                    )
                except ApiError as exc:
                    status = exc.status
                    payload = outer.service.envelope(
                        request_id,
                        str(uuid.uuid4()),
                        success=False,
                        error_code=exc.code,
                        error_message=exc.message,
                    )
                except Exception:
                    LOGGER.exception("unhandled quant API error")
                    status = 500
                    payload = outer.service.envelope(
                        request_id,
                        str(uuid.uuid4()),
                        success=False,
                        error_code="INTERNAL_ERROR",
                        error_message="internal server error",
                    )
                encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(encoded)
                outer._audit_log(method, path, status, request_id, payload.get("run_id"), time.monotonic() - started)

        return Handler

    def _audit_log(self, method: str, path: str, status: int, request_id: str, run_id: str | None, elapsed: float) -> None:
        record = {
            "timestamp": _utc_now().isoformat(),
            "method": method,
            "path": path,
            "status": status,
            "request_id": request_id,
            "run_id": run_id,
            "elapsed_ms": round(elapsed * 1000, 2),
        }
        with self._log_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")

    def serve_forever(self) -> None:
        self.httpd.serve_forever(poll_interval=0.2)

    def shutdown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
