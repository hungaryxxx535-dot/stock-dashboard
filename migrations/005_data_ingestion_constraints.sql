CREATE UNIQUE INDEX IF NOT EXISTS uq_industry_membership_version
ON industry_membership_history(symbol, industry_code, classification, effective_from, source);
