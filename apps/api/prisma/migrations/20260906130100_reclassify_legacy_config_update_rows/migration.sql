-- Data migration only, run as its own transaction (separate migration file)
-- strictly *after* the previous one's ADD VALUE statements have committed --
-- Postgres disallows using a newly-added enum value in the same transaction
-- that added it.
--
-- Reclassifies any pre-existing CONFIG_UPDATE row (the single bucket the
-- taxonomy previously lumped every non-carrier technical change into) into
-- whichever of the 3 new technical categories its own stored description
-- text actually matches, mirroring Ir21ChangeHistoryUtil.
-- classifyNonCarrierChange's technical-category priority order (Diameter/
-- realm checked before SS7/point-code, IP/subnet last as the generic
-- catch-all). No row needs re-checking against the admin pattern -- these
-- were already classified as CONFIG_UPDATE (not ADMIN_UPDATE) by the prior
-- version of the classifier, which checked the administrative pattern
-- first.
UPDATE "Ir21RoutingChange"
SET
  "changeType" = (CASE
    WHEN description ~* '(realm|DEA|FQDN|DRA|diameter agent|S6a|Gy|Gx)' THEN 'DIAMETER_REALM_UPDATE'
    WHEN description ~* '(GT|global title|point code|DPC|OPC|SPC|STP)' THEN 'POINT_CODE_GT_UPDATE'
    ELSE 'IP_SUBNET_UPDATE'
  END)::"RoutingChangeType",
  "matchedRule" = CASE
    WHEN description ~* '(realm|DEA|FQDN|DRA|diameter agent|S6a|Gy|Gx)' THEN 'REGEX_DIAMETER_REALM'
    WHEN description ~* '(GT|global title|point code|DPC|OPC|SPC|STP)' THEN 'REGEX_POINT_CODE_GT'
    ELSE 'REGEX_IP_RANGE'
  END
WHERE "changeType" = 'CONFIG_UPDATE';
