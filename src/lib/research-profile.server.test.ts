import { describe, expect, it } from "vitest";
import { parseEastmoneyProfile, parseGoogleNewsRss, parseNasdaqProfile } from "./research-profile.server";

describe("research profile source parsers", () => {
  it("maps an Eastmoney company survey without inventing missing fields", () => {
    const profile = parseEastmoneyProfile({ jbzl: [{ ORG_NAME: "示例银行", INDUSTRYCSRC1: "金融业", EM2016: "金融-银行", MAIN_BUSINESS: "银行业务", TRADE_MARKET: "上海证券交易所" }] }, "600000");
    expect(profile).toMatchObject({ organizationName: "示例银行", sector: "金融业", industry: "金融-银行", source: "东方财富公司资料" });
    expect(profile?.description).toBe("");
  });

  it("maps a Nasdaq profile", () => {
    const profile = parseNasdaqProfile({ data: { CompanyName: { value: "Example Inc." }, Sector: { value: "Technology" }, Industry: { value: "Semiconductors" }, CompanyDescription: { value: "Chip maker" }, Region: { value: "North America" } } }, "EXM");
    expect(profile).toMatchObject({ organizationName: "Example Inc.", sector: "Technology", industry: "Semiconductors" });
  });

  it("keeps publisher, link and timestamp for each RSS item", () => {
    const xml = '<rss><item><title><![CDATA[Example headline]]></title><link>https://example.com/a</link><source>Example News</source><pubDate>Thu, 03 Sep 2026 12:00:00 GMT</pubDate></item></rss>';
    expect(parseGoogleNewsRss(xml)[0]).toMatchObject({ title: "Example headline", url: "https://example.com/a", publisher: "Example News", publishedAt: "2026-09-03T12:00:00.000Z" });
  });
});
