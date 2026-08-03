from __future__ import annotations

import tempfile
import unittest
from datetime import date, datetime, timezone
from pathlib import Path

from hermes_quant.config import Settings
from hermes_quant.data.repository import QuantRepository
from hermes_quant.messaging.feishu import DISCLAIMER, FeishuMessenger, MessageKind, RecordingTransport
from hermes_quant.scheduler.jobs import DailyScheduler, JobSpec, default_job_specs


class OperationsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = QuantRepository(Path(self.temp.name) / "ops.db")
        self.repo.migrate(Path(__file__).parents[1] / "migrations")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_feishu_disabled_by_default(self) -> None:
        transport = RecordingTransport()
        result = FeishuMessenger(self.repo, transport).send(MessageKind.DAILY_REVIEW, "无真实发送", datetime.now(timezone.utc), "v1")
        self.assertEqual(result.status, "disabled")
        self.assertEqual(transport.messages, [])

    def test_feishu_dedup_retry_split_and_disclaimer(self) -> None:
        transport = RecordingTransport(failures_before_success=1)
        messenger = FeishuMessenger(self.repo, transport, enabled=True, max_chars=300, retries=2)
        cutoff = datetime(2024, 1, 2, 15, tzinfo=timezone.utc)
        first = messenger.send(MessageKind.WEEKLY_REPORT, "长报告" * 300, cutoff, "champion-v1")
        second = messenger.send(MessageKind.WEEKLY_REPORT, "长报告" * 300, cutoff, "champion-v1")
        self.assertEqual(first.status, "succeeded")
        self.assertEqual(second.status, "duplicate")
        self.assertGreater(first.chunks_sent, 1)
        self.assertTrue(all(DISCLAIMER in message for message in transport.messages))
        self.assertGreater(first.attempts, first.chunks_sent)

    def test_scheduler_default_off_and_gated_pushes_off(self) -> None:
        settings = Settings.from_env(Path(self.temp.name))
        specs = default_job_specs(settings)
        self.assertTrue(all(not spec.enabled for spec in specs))
        scheduler = DailyScheduler(self.repo, specs, lambda _: True)
        called: list[str] = []
        result = scheduler.run("data_sync", date(2024, 1, 2), called.append)
        self.assertEqual(result.status, "disabled")
        self.assertEqual(called, [])

    def test_scheduler_idempotency_retry_and_trading_calendar(self) -> None:
        attempts = 0
        def flaky(run_id: str) -> None:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise TimeoutError("fixture")
        scheduler = DailyScheduler(self.repo, (JobSpec("daily_review", "15:30", "review", True),), lambda day: day.weekday() < 5, retries=2)
        first = scheduler.run("daily_review", date(2024, 1, 2), flaky)
        second = scheduler.run("daily_review", date(2024, 1, 2), flaky)
        weekend = scheduler.run("daily_review", date(2024, 1, 6), flaky)
        self.assertEqual((first.status, first.attempts), ("succeeded", 2))
        self.assertTrue(second.duplicate)
        self.assertEqual(weekend.status, "non_trading_day")
        self.assertEqual(attempts, 2)


if __name__ == "__main__":
    unittest.main()
