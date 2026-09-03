from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Protocol
from urllib.request import Request, urlopen

from hermes_quant.data.repository import QuantRepository


DISCLAIMER = "仅为模拟交易系统输出，不代表真实证券交易指令。"


class MessageKind(str, Enum):
    PREMARKET_CANDIDATES = "premarket_candidates"
    AUCTION_REVIEW = "auction_review"
    PAPER_FILL = "paper_fill"
    POSITION_RISK = "position_risk"
    DAILY_REVIEW = "daily_review"
    WEEKLY_REPORT = "weekly_report"
    MONTHLY_REPORT = "monthly_report"
    SYSTEM_ERROR = "system_error"


TITLES = {
    MessageKind.PREMARKET_CANDIDATES: "盘前候选（0—3只）",
    MessageKind.AUCTION_REVIEW: "集合竞价复核",
    MessageKind.PAPER_FILL: "模拟成交",
    MessageKind.POSITION_RISK: "持仓风险",
    MessageKind.DAILY_REVIEW: "收盘复盘",
    MessageKind.WEEKLY_REPORT: "模拟周报",
    MessageKind.MONTHLY_REPORT: "模拟月报",
    MessageKind.SYSTEM_ERROR: "系统异常",
}


class MessageTransport(Protocol):
    def send(self, text: str) -> None: ...


class WebhookTransport:
    def __init__(self, webhook_url: str, timeout_seconds: float = 10.0) -> None:
        if not webhook_url.startswith("https://"):
            raise ValueError("Feishu webhook must use HTTPS")
        self.webhook_url = webhook_url
        self.timeout_seconds = timeout_seconds

    def send(self, text: str) -> None:
        payload = json.dumps({"msg_type": "text", "content": {"text": text}}, ensure_ascii=False).encode("utf-8")
        request = Request(self.webhook_url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
        with urlopen(request, timeout=self.timeout_seconds) as response:
            body = json.loads(response.read().decode("utf-8"))
        if body.get("code", body.get("StatusCode", 0)) not in (0, None):
            raise RuntimeError(f"Feishu rejected message: code={body.get('code', body.get('StatusCode'))}")


class RecordingTransport:
    def __init__(self, failures_before_success: int = 0) -> None:
        self.messages: list[str] = []
        self.failures_before_success = failures_before_success
        self.attempts = 0

    def send(self, text: str) -> None:
        self.attempts += 1
        if self.attempts <= self.failures_before_success:
            raise TimeoutError("fixture transport timeout")
        self.messages.append(text)


@dataclass(frozen=True)
class DeliveryResult:
    dedup_key: str
    status: str
    chunks_sent: int
    attempts: int


class FeishuMessenger:
    def __init__(self, repository: QuantRepository, transport: MessageTransport, enabled: bool = False, max_chars: int = 3500, retries: int = 3) -> None:
        self.repository = repository
        self.transport = transport
        self.enabled = enabled
        self.max_chars = max(300, max_chars)
        self.retries = max(1, retries)

    @staticmethod
    def render(kind: MessageKind, body: str, data_cutoff: datetime, model_version: str) -> str:
        return f"【PAPER 模拟交易】{TITLES[kind]}\n数据截止：{data_cutoff.isoformat()}\n模型版本：{model_version}\n\n{body.strip()}\n\n{DISCLAIMER}"

    def _chunks(self, text: str) -> list[str]:
        if len(text) <= self.max_chars:
            return [text]
        reserve = len(DISCLAIMER) + 20
        size = self.max_chars - reserve
        parts = [text[index:index + size] for index in range(0, len(text), size)]
        return [f"{part}\n\n（{index + 1}/{len(parts)}）{DISCLAIMER}" for index, part in enumerate(parts)]

    def send(self, kind: MessageKind, body: str, data_cutoff: datetime, model_version: str) -> DeliveryResult:
        if not self.enabled:
            return DeliveryResult("disabled", "disabled", 0, 0)
        rendered = self.render(kind, body, data_cutoff, model_version)
        dedup_key = hashlib.sha256(f"{kind.value}|{data_cutoff.isoformat()}|{model_version}|{body}".encode("utf-8")).hexdigest()
        with self.repository.transaction() as connection:
            existing = connection.execute("SELECT status,chunks_sent,attempts FROM message_deliveries WHERE dedup_key=?", (dedup_key,)).fetchone()
            if existing and existing["status"] == "succeeded":
                return DeliveryResult(dedup_key, "duplicate", existing["chunks_sent"], existing["attempts"])
            connection.execute("INSERT OR IGNORE INTO message_deliveries(dedup_key,message_kind,data_cutoff,model_version,status,chunks_sent,attempts,created_at) VALUES(?,?,?,?,?,?,?,?)", (dedup_key, kind.value, data_cutoff.isoformat(), model_version, "sending", 0, 0, datetime.now().astimezone().isoformat()))
        attempts = 0
        chunks_sent = 0
        try:
            for chunk in self._chunks(rendered):
                for attempt in range(self.retries):
                    attempts += 1
                    try:
                        self.transport.send(chunk)
                        chunks_sent += 1
                        break
                    except Exception:
                        if attempt + 1 == self.retries:
                            raise
                        time.sleep(0.05 * 2**attempt)
            status, error_type, error_message = "succeeded", None, None
        except Exception as exc:
            status, error_type, error_message = "failed", type(exc).__name__, str(exc)[:500]
        with self.repository.transaction() as connection:
            connection.execute("UPDATE message_deliveries SET status=?,chunks_sent=?,attempts=?,finished_at=?,error_type=?,error_message=? WHERE dedup_key=?", (status, chunks_sent, attempts, datetime.now().astimezone().isoformat(), error_type, error_message, dedup_key))
        return DeliveryResult(dedup_key, status, chunks_sent, attempts)

