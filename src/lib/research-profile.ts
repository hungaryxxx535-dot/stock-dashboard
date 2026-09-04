export type ResearchProfile = {
  organizationName: string;
  sector: string;
  industry: string;
  description: string;
  mainBusiness: string;
  listingMarket: string;
  listingDate: string;
  source: string;
  sourceUrl: string;
};

export type ResearchNewsItem = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
};

export type ResearchProfileResponse = {
  status: "updated" | "partial" | "failed";
  fetchedAt: string;
  profile: ResearchProfile | null;
  news: ResearchNewsItem[];
  warnings: string[];
};
