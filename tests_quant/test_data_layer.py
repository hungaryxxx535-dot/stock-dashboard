from __future__ import annotations

import tempfile
import time
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pandas as pd

from hermes_quant.data.models import Announcement, DailyBar, IndustryMembership, IntervalStatus, MinuteBar, Security
from hermes_quant.data.repository import QuantRepository
from hermes_quant.data.universe import PointInTimeUniverse
from hermes_quant.data.validation import validate_daily_bars
from hermes_quant.data.provider import DataProvider, ProviderResult, ResilientProvider
from hermes_quant.data.market_rules import PriceLimitRuleResolver
from hermes_quant.data.akshare_provider import AkShareProvider, configure_http_environment
from hermes_quant.config import Settings


class SettingsTests(unittest.TestCase):
    def test_ignored_local_env_is_loaded(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict("os.environ", {}, clear=True):
            root = Path(directory)
            (root / ".env.local").write_text(
                "HERMES_QUANT_API_TOKEN=fixture-token-long-enough\nHERMES_QUANT_API_PORT=8877\n",
                encoding="utf-8",
            )
            settings = Settings.from_env(root)
            self.assertEqual(settings.api_token, "fixture-token-long-enough")
            self.assertEqual(settings.api_port, 8877)

    def test_parent_environment_overrides_local_env(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            "os.environ", {"HERMES_QUANT_API_PORT": "8878"}, clear=True
        ):
            root = Path(directory)
            (root / ".env.local").write_text("HERMES_QUANT_API_PORT=8877\n", encoding="utf-8")
            self.assertEqual(Settings.from_env(root).api_port, 8878)


class DataLayerTests(unittest.TestCase):
    def test_minute_falls_back_to_sina_and_filters_requested_range(self) -> None:
        class FakeAkShare:
            @staticmethod
            def stock_zh_a_hist_min_em(**_kwargs):
                raise ConnectionError("eastmoney unavailable")

            @staticmethod
            def stock_zh_a_minute(**_kwargs):
                return pd.DataFrame(
                    [
                        {"day": "2026-08-01 15:00:00", "open": 9, "high": 9, "low": 9, "close": 9, "volume": 1, "amount": 9},
                        {"day": "2026-08-03 09:30:00", "open": 10, "high": 11, "low": 9, "close": 10.5, "volume": 100, "amount": 1050},
                    ]
                )

        result = AkShareProvider(FakeAkShare()).fetch_minute_bars(
            "600036", datetime(2026, 8, 3, 9, 30), datetime(2026, 8, 3, 15), "5"
        )
        self.assertEqual((result.endpoint, len(result.items)), ("stock_zh_a_minute", 1))
        self.assertEqual(result.items[0].close, 10.5)

    def test_cninfo_industry_and_announcement_mapping(self) -> None:
        class FakeAkShare:
            @staticmethod
            def stock_industry_change_cninfo(**_kwargs):
                return pd.DataFrame(
                    [{"证券代码": "600036", "行业编码": "J66", "行业大类": "货币金融服务", "分类标准": "上市公司协会", "变更日期": "2024-02-08"}]
                )

        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "data": {
                        "total_hits": 1,
                        "list": [{
                            "art_code": "AN1",
                            "notice_date": "2026-07-29 00:00:00",
                            "title": "测试公告",
                            "codes": [{"stock_code": "600036"}],
                        }],
                    }
                }

        provider = AkShareProvider(FakeAkShare(), http_get=lambda *_args, **_kwargs: FakeResponse())
        industries = provider.fetch_industry_history("600036", date(1990, 1, 1), date(2026, 8, 3))
        announcements = provider.fetch_announcements("600036", date(2026, 7, 1), date(2026, 8, 3))
        self.assertEqual((len(industries.items), industries.items[0].industry_code), (1, "J66"))
        self.assertEqual((len(announcements.items), announcements.items[0].announcement_id), (1, "AN1"))

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
        self.assertEqual(resolver.resolve("CHINEXT", date(2020, 8, 23)).limit_up_pct, 0.10)

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

    def test_extended_market_data_upserts_are_idempotent(self) -> None:
        fetched = datetime(2026, 8, 3, 16, tzinfo=timezone.utc)
        minute = MinuteBar("600036", fetched, 10, 11, 9, 10.5, 100, 1050, "fixture", fetched, "v1")
        industry = IndustryMembership("600036", "J66", "银行", "fixture", date(2024, 2, 8), None, fetched, "fixture")
        announcement = Announcement("600036", "AN1", "公告", fetched, "fixture")
        self.assertEqual(self.repo.upsert_minute_bars([minute]), 1)
        self.assertEqual(self.repo.upsert_minute_bars([minute]), 1)
        self.assertEqual(self.repo.upsert_industry_memberships([industry]), 1)
        self.assertEqual(self.repo.upsert_industry_memberships([industry]), 1)
        self.assertEqual(self.repo.upsert_announcements([announcement]), 1)
        self.assertEqual(self.repo.upsert_announcements([announcement]), 1)
        with self.repo.session() as connection:
            counts = tuple(
                connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                for table in ("minute_bars", "industry_membership_history", "announcements")
            )
        self.assertEqual(counts, (1, 1, 1))


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
