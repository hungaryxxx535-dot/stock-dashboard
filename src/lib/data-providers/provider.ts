import type { DataSourceStatus } from "@/domain/model";

export type ProviderContext = {
  signal: AbortSignal;
  now: Date;
};

export type ProviderResult<T> = {
  data: T;
  status: DataSourceStatus;
  warnings: string[];
};

export interface DataProvider<T> {
  id: string;
  load(context: ProviderContext): Promise<ProviderResult<T>>;
}

export async function runProviders<T>(providers: DataProvider<T>[], timeoutMs = 15_000): Promise<ProviderResult<T>[]> {
  const settled = await Promise.allSettled(
    providers.map(async (provider) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await provider.load({ signal: controller.signal, now: new Date() });
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
  return settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const fetchedAt = new Date().toISOString();
    return {
      data: {} as T,
      status: {
        id: providers[index].id,
        name: providers[index].id,
        state: result.reason instanceof Error && result.reason.name === "AbortError" ? "timeout" : "error",
        source: providers[index].id,
        marketTime: null,
        fetchedAt,
        delayed: true,
        cached: false,
        fallback: false,
        message: result.reason instanceof Error ? result.reason.message : "数据源异常",
      },
      warnings: [result.reason instanceof Error ? result.reason.message : "数据源异常"],
    };
  });
}
