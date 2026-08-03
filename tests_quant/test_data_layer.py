from __future__ import annotations

import tempfile
import time
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from hermes_quant.data.models import Announcement, DailyBar, IntervalStatus, Security
from hermes_quant.data.repository import QuantRepository
from hermes_quant.data.universe import PointInTimeUniverse
from hermes_quant.data.validation import validate_daily_bars
from hermes_quant.data.provider import DataProvider, ProviderResult, ResilientProvider
from hermes_quant.data.market_rules import PriceLimitRuleResolver
from hermes_quant.data.akshare_provider import AkShareProvider, configure_http_environment


class DataLayerTests(unittest.TestCase):
    def test_akshare_daily_falls_back_from_eastmoney_to_sina(self) -> None:
        class FakeAkShare:
            __version__ = "fixture"

            @staticmethod
            def stock_zh_a_hist(**_kwargs):
                raise ConnectionError("eastmoney unavailable")

            @staticmethod
            def stock_zh_a_daily(**_kwargs):
                return pd.DataFrame(
                    [{"open": 10, "high": 11, "low": 9, "close": 10.5, "volume": 1000, "amount": 10500}],
                    index=[date(2024, 1, 2)],
                )

        result = AkShareProvider(FakeAkShare()).fetch_daily_bars("600001", date(2024, 1, 2), date(2024, 1, 2))
        self.assertEqual(result.endpoint, "stock_zh_a_daily")
        self.assertEqual((len(result.items), result.items[0].close), (1, 10.5))

    def test_proxy_configuration_prefers_explicit_and_defaults_to_direct(self) -> None:
        names = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY")
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(configure_http_environment(None), "direct")
            self.assertEqual(__import__("os").environ["NO_PROXY"], "*")
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(configure_http_environment("http://127.0.0.1:8080"), "explicit")
            self.assertEqual(__import__("os").environ["HTTPS_PROXY"], "http://127.0.0.1:8080")
        with patch.dict("os.environ", {name: "" for name in names}, clear=True):
            with self.assertRaises(ValueError):
                configure_http_environment("not-a-proxy")

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = QuantRepository(Path(self.temp.name) / "test.db")
        self.repo.migrate(Path(__file__).parents[1] / "migrations")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_migration_is_idempotent_and_builds_required_tables(self) -> None:
        self.assertEqual(self.repo.migrate(Path(__file__).parents[1] / "migrations"), [])
        required = {"securities_master", "listing_history", "delisting_history", "risk_warning_history", "suspension_history", "daily_bars", "minute_bars", "adjustment_factors", "trading_calendar", "price_limit_rules", "corporate_actions", "announcements", "financial_release_dates", "industry_membership_history", "data_quality_log", "data_sync_runs"}
        with self.repo.session() as connection:
            actual = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertTrue(required.issubset(actual))

    def test_daily_bar_validation_catches_invalid_and_duplicate_rows(self) -> None:
        good = DailyBar("600001", date(2024, 1, 2), 10, 11, 9, 10.5, 1000, 10000)
        bad = DailyBar("600001", date(2024, 1, 2), 10, 8, 11, 10.5, -1, 10000)
        checks = {issue.check_name for issue in validate_daily_bars([good, bad])}
        self.assertEqual(checks, {"duplicate_bar", "invalid_ohlc", "negative_liquidity"})

    def test_sync_run_records_failure_without_fake_success(self) -> None:
        run_id = self.repo.start_sync_run("fixture", "daily", {"start": "2024-01-01"})
        self.repo.finish_sync_run(run_id, "failed", 0, error_type="TimeoutError", error_message="fixture timeout")
        with self.repo.session() as connection:
            row = connection.execute("SELECT status,row_count,error_type FROM data_sync_runs WHERE run_id=?", (run_id,)).fetchone()
        self.assertEqual(tuple(row), ("failed", 0, "TimeoutError"))

    def test_board_price_limit_rules_are_date_effective(self) -> None:
        with self.repo.transaction() as connection:
            connection.executemany("INSERT INTO price_limit_rules(board,effective_from,effective_to,risk_status,limit_up_pct,limit_down_pct,source) VALUES(?,?,?,?,?,?,?)", [
                ("MAIN", "2020-01-01", None, None, 0.10, 0.10, "TEST_FIXTURE"),
                ("CHINEXT", "2020-08-24", None, None, 0.20, 0.20, "TEST_FIXTURE"),
            ])
        resolver = PriceLimitRuleResolver(self.repo)
        self.assertEqual(resolver.resolve("MAIN", date(2024, 1, 2)).limit_up_pct, 0.10)
        self.assertEqual(resolver.resolve("CHINEXT", date(2024, 1, 2)).limit_up_pct, 0.20)
        self.assertIsNone(resolver.resolve("CHINEXT", date(2020, 8, 23)))

    def test_provider_timeout_retries_then_recovers_from_cache(self) -> None:
        class FixtureProvider(DataProvider):
            name = "fixture"
            def fetch_securities(self): raise NotImplementedError
            def fetch_daily_bars(self, symbol, start, end): raise NotImplementedError
            def health_check(self): return {"status": "ok"}
        now = datetime.now(timezone.utc)
        cached_result = ProviderResult("fixture", "daily", now, now, "2024-01-01", "v1", [])
        wrapper = ResilientProvider(FixtureProvider(), Path(self.temp.name) / "cache", retries=1, rate_per_second=0, timeout_seconds=0.01)
        serialize = lambda result: {"provider": result.provider, "endpoint": result.endpoint, "requested_at": result.requested_at.isoformat(), "fetched_at": result.fetched_at.isoformat(), "data_timestamp": result.data_timestamp, "data_version": result.data_version, "items": []}
        deserialize = lambda payload: ProviderResult(payload["provider"], payload["endpoint"], datetime.fromisoformat(payload["requested_at"]), datetime.fromisoformat(payload["fetched_at"]), payload["data_timestamp"], payload["data_version"], [])
        wrapper.cache.put("bars", serialize(cached_result))
        recovered = wrapper.execute("bars", lambda: time.sleep(0.1), serialize, deserialize)
        self.assertTrue(recovered.cache_hit)
        self.assertTrue(recovered.stale)
        self.assertIn("TimeoutError", recovered.error)


class PointInTimeUniverseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = QuantRepository(Path(self.temp.name) / "pit.db")
        self.repo.migrate(Path(__file__).parents[1] / "migrations")
        self.repo.upsert_securities([
            Security("600001", "存续股", "SSE", "MAIN", "stock", date(2020, 1, 1), source="fixture"),
            Security("600002", "未来上市", "SSE", "MAIN", "stock", date(2025, 1, 1), source="fixture"),
            Security("600003", "历史退市", "SSE", "MAIN", "stock", date(2010, 1, 1), delisting_date=date(2023, 6, 30), source="fixture"),
            Security("300001", "创业板", "SZSE", "CHINEXT", "stock", date(2018, 1, 1), source="fixture"),
        ])
        self.universe = PointInTimeUniverse(self.repo)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_future_listing_does_not_enter_early_and_delisted_remains_historical(self) -> None:
        symbols_2022 = {item.symbol for item in self.universe.members(date(2022, 1, 4))}
        symbols_2024 = {item.symbol for item in self.universe.members(date(2024, 1, 4))}
        self.assertNotIn("600002", symbols_2022)
        self.assertIn("600003", symbols_2022)
        self.assertNotIn("600003", symbols_2024)

    def test_risk_warning_and_suspension_apply_only_in_effective_interval(self) -> None:
        self.repo.add_interval_status("risk_warning_history", IntervalStatus("600001", datetime(2023, 1, 1, tzinfo=timezone.utc), datetime(2023, 3, 1, tzinfo=timezone.utc), "ST", "fixture", datetime(2022, 12, 31, tzinfo=timezone.utc)))
        self.repo.add_interval_status("suspension_history", IntervalStatus("300001", datetime(2023, 2, 1, tzinfo=timezone.utc), datetime(2023, 2, 10, tzinfo=timezone.utc), "SUSPENDED", "fixture", datetime(2023, 1, 31, tzinfo=timezone.utc)))
        february = {item.symbol for item in self.universe.members(date(2023, 2, 2))}
        march = {item.symbol for item in self.universe.members(date(2023, 3, 2))}
        self.assertNotIn("600001", february)
        self.assertNotIn("300001", february)
        self.assertIn("600001", march)
        self.assertIn("300001", march)

    def test_future_announcement_cannot_enter_past_signal(self) -> None:
        self.repo.add_announcement(Announcement("600001", "a1", "过去公告", datetime(2024, 1, 2, 9, tzinfo=timezone.utc), "fixture"))
        self.repo.add_announcement(Announcement("600001", "a2", "未来公告", datetime(2024, 1, 3, 9, tzinfo=timezone.utc), "fixture"))
        known = self.universe.announcements_known("600001", datetime(2024, 1, 2, 15, tzinfo=timezone.utc))
        self.assertEqual([item["announcement_id"] for item in known], ["a1"])


if __name__ == "__main__":
    unittest.main()
