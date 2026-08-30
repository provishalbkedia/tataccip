-- Split asNumbers into mnoAsNumbers (the operator's own ASN(s)) and
-- providerAsNumbers (a specific provider's own ASN, "ProviderName: ASN"
-- strings) -- IR.21's GRX/IPX ASN table carries a "Network Owner" per row
-- that this previously ignored. Existing asNumbers values are preserved
-- as mnoAsNumbers (that's what they were assumed to be before this split).
ALTER TABLE "MnoMasterConnectivity" RENAME COLUMN "asNumbers" TO "mnoAsNumbers";
ALTER TABLE "MnoMasterConnectivity" ADD COLUMN "providerAsNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
