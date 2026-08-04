from __future__ import annotations

import json
import os
import tempfile
import threading
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from hermes_quant.api.server import QuantApiServer
from hermes_quant.config import Settings
from hermes_quant.data.repository import QuantRepository


TOKEN = "test-only-token-0123456789"


class QuantApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def settings(self, rate: int = 120) -> Settings:
        previous = dict(os.environ)
        try:
            os.environ.clear()
            os.environ.update(
                {
                    "HERMES_DB_PATH": str(self.root / "quant.db"),
                    "HERMES_CACHE_DIR": str(self.root / "cache"),
                    "HERMES_EXECUTION_MODE": "paper",
                    "HERMES_QUANT_API_TOKEN": TOKEN,
                    "HERMES_QUANT_API_RATE_LIMIT_PER_MINUTE": str(rate),
                }
            )
            return Settings.from_env(self.root)
        finally:
            os.environ.clear()
            os.environ.update(previous)

    @contextmanager
    def server(self, rate: int = 120):
        settings = self.settings(rate)
        repository = QuantRepository(settings.database_path)
        instance = QuantApiServer(settings, repository=repository, port=0)
        thread = threading.Thread(target=instance.serve_forever, daemon=True)
        thread.start()
        try:
            yield instance
        finally:
            instance.shutdown()
            thread.join(timeout=2)

    def request(
        self,
        server: QuantApiServer,
        method: str,
        path: str,
        body: dict | None = None,
        *,
        token: str = TOKEN,
        idempotency_key: str | None = None,
    ) -> tuple[int, dict]:
        host, port = server.address
        encoded = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        request = Request(f"http://{host}:{port}{path}", data=encoded, headers=headers, method=method)
        try:
            with urlopen(request, timeout=2) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            return exc.code, json.loads(exc.read().decode("utf-8"))

    def test_health_requires_token_and_has_complete_envelope(self) -> None:
        with self.server() as server:
            status, denied = self.request(server, "GET", "/health", token="wrong")
            self.assertEqual(status, 401)
            self.assertEqual(denied["error_code"], "UNAUTHORIZED")
            status, payload = self.request(server, "GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["environment"], "paper")
        self.assertTrue(payload["success"])
        self.assertEqual(
            {
                "request_id", "run_id", "model_version", "environment", "data_timestamp",
                "data_sources", "data_quality", "success", "error_code", "error_message", "data",
            },
            set(payload),
        )

    def test_public_bind_and_missing_token_are_rejected(self) -> None:
        settings = self.settings()
        with self.assertRaisesRegex(RuntimeError, "loopback"):
            QuantApiServer(settings, host="0.0.0.0", port=0)
        previous = os.environ.pop("HERMES_QUANT_API_TOKEN", None)
        try:
            without_token = Settings.from_env(self.root)
        finally:
            if previous is not None:
                os.environ["HERMES_QUANT_API_TOKEN"] = previous
        with self.assertRaisesRegex(RuntimeError, "HERMES_QUANT_API_TOKEN"):
            QuantApiServer(without_token, port=0)

    def test_paper_order_idempotency_schema_and_cancel(self) -> None:
        signal_time = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        body = {
            "orders": [
                {
                    "account_id": "champion",
                    "strategy_id": "platform_breakout",
                    "model_version": "champion-v1",
                    "symbol": "600001",
                    "side": "BUY",
                    "order_type": "LIMIT",
                    "signal_time": signal_time,
                    "quantity": 100,
                    "limit_price": 10.0,
                }
            ]
        }
        with self.server() as server:
            missing_status, missing = self.request(server, "POST", "/paper/orders", body)
            self.assertEqual((missing_status, missing["error_code"]), (400, "IDEMPOTENCY_KEY_REQUIRED"))
            first_status, first = self.request(server, "POST", "/paper/orders", body, idempotency_key="create-1")
            second_status, second = self.request(server, "POST", "/paper/orders", body, idempotency_key="create-1")
            self.assertEqual(first_status, 200)
            self.assertEqual(second_status, 200)
            self.assertEqual(first, second)
            order = first["data"]["orders"][0]
            self.assertEqual(order["status"], "ACCEPTED")
            status, listing = self.request(server, "GET", "/paper/orders")
            self.assertEqual((status, len(listing["data"]["orders"])), (200, 1))
            cancel_status, cancelled = self.request(
                server,
                "POST",
                f"/paper/orders/{order['order_id']}/cancel",
                {},
                idempotency_key="cancel-1",
            )
            self.assertEqual(cancel_status, 200)
            self.assertEqual(cancelled["data"]["order"]["status"], "CANCELLED")

    def test_strategy_pause_blocks_order_and_auction_degrades(self) -> None:
        with self.server() as server:
            status, paused = self.request(
                server,
                "POST",
                "/strategies/platform_breakout/pause",
                {"reason": "acceptance test"},
                idempotency_key="pause-1",
            )
            self.assertEqual(status, 200)
            self.assertEqual(paused["data"]["state"], "paused")
            signal_time = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            order_body = {
                "orders": [{
                    "account_id": "champion", "strategy_id": "platform_breakout",
                    "model_version": "champion-v1", "symbol": "600001", "side": "BUY",
                    "order_type": "LIMIT", "signal_time": signal_time, "quantity": 100, "limit_price": 10.0,
                }]
            }
            _, order = self.request(server, "POST", "/paper/orders", order_body, idempotency_key="paused-order")
            self.assertEqual(order["data"]["orders"][0]["rejection_reason"], "STRATEGY_PAUSED")
            auction_status, auction = self.request(
                server,
                "POST",
                "/candidates/auction-review",
                {"trade_date": "2026-08-03", "candidate_symbols": ["600001"]},
                idempotency_key="auction-1",
            )
            self.assertEqual(auction_status, 422)
            self.assertEqual(auction["error_code"], "AUCTION_DATA_UNAVAILABLE")

    def test_rate_limit_and_strict_schema(self) -> None:
        with self.server(rate=2) as server:
            self.assertEqual(self.request(server, "GET", "/health")[0], 200)
            self.assertEqual(self.request(server, "GET", "/health")[0], 200)
            status, payload = self.request(server, "GET", "/health")
        self.assertEqual(status, 429)
        self.assertEqual(payload["error_code"], "RATE_LIMITED")


if __name__ == "__main__":
    unittest.main()
