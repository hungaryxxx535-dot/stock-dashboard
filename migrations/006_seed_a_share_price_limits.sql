INSERT INTO price_limit_rules(board,effective_from,effective_to,risk_status,limit_up_pct,limit_down_pct,source)
SELECT 'MAIN','1990-12-19',NULL,NULL,0.10,-0.10,'EXCHANGE_RULES_STATIC_V1'
WHERE NOT EXISTS(SELECT 1 FROM price_limit_rules WHERE board='MAIN' AND effective_from='1990-12-19' AND risk_status IS NULL);

INSERT INTO price_limit_rules(board,effective_from,effective_to,risk_status,limit_up_pct,limit_down_pct,source)
SELECT 'CHINEXT','2009-10-30','2020-08-24',NULL,0.10,-0.10,'EXCHANGE_RULES_STATIC_V1'
WHERE NOT EXISTS(SELECT 1 FROM price_limit_rules WHERE board='CHINEXT' AND effective_from='2009-10-30' AND risk_status IS NULL);

INSERT INTO price_limit_rules(board,effective_from,effective_to,risk_status,limit_up_pct,limit_down_pct,source)
SELECT 'CHINEXT','2020-08-24',NULL,NULL,0.20,-0.20,'EXCHANGE_RULES_STATIC_V1'
WHERE NOT EXISTS(SELECT 1 FROM price_limit_rules WHERE board='CHINEXT' AND effective_from='2020-08-24' AND risk_status IS NULL);

INSERT INTO price_limit_rules(board,effective_from,effective_to,risk_status,limit_up_pct,limit_down_pct,source)
SELECT 'STAR','2019-07-22',NULL,NULL,0.20,-0.20,'EXCHANGE_RULES_STATIC_V1'
WHERE NOT EXISTS(SELECT 1 FROM price_limit_rules WHERE board='STAR' AND effective_from='2019-07-22' AND risk_status IS NULL);

INSERT INTO price_limit_rules(board,effective_from,effective_to,risk_status,limit_up_pct,limit_down_pct,source)
SELECT 'BSE','2021-11-15',NULL,NULL,0.30,-0.30,'EXCHANGE_RULES_STATIC_V1'
WHERE NOT EXISTS(SELECT 1 FROM price_limit_rules WHERE board='BSE' AND effective_from='2021-11-15' AND risk_status IS NULL);
