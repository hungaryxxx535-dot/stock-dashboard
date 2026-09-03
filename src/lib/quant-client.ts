type QuantEnvelope<T> = {
  environment: string;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  data: T;
};

export class QuantClientError extends Error {
  constructor(message: string, public readonly status = 503, public readonly code = "QUANT_UNAVAILABLE") {
    super(message);
  }
}

function configuration() {
  const raw = process.env.HERMES_QUANT_API_URL || `http://${process.env.HERMES_QUANT_API_HOST || "127.0.0.1"}:${process.env.HERMES_QUANT_API_PORT || "8765"}`;
  const url = new URL(raw);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new QuantClientError("量化 API 只允许使用本机回环地址。", 503, "NON_LOOPBACK_REJECTED");
  }
  const token = process.env.HERMES_QUANT_API_TOKEN?.trim();
  if (!token || token.length < 16) throw new QuantClientError("Paper 服务尚未配置本机访问令牌。", 503, "PAPER_NOT_CONFIGURED");
  return { baseUrl: url.toString().replace(/\/$/, ""), token };
}

export async function quantRequest<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const { baseUrl, token } = configuration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json() as QuantEnvelope<T>;
    if (payload.environment !== "paper") throw new QuantClientError("拒绝非 Paper 环境响应。", 502, "NON_PAPER_RESPONSE");
    if (!response.ok || !payload.success) throw new QuantClientError(payload.error_message || "Paper 服务请求失败。", response.status, payload.error_code || "QUANT_ERROR");
    return payload.data;
  } catch (error) {
    if (error instanceof QuantClientError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new QuantClientError("Paper 服务响应超时。", 504, "QUANT_TIMEOUT");
    throw new QuantClientError("无法连接本机 Paper 服务。", 503, "QUANT_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
