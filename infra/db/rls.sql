-- =========================================================================
-- OmniSell RLS policies — second line of defence behind tenant-scoped
-- repositories (prompt.md constraint #4, Phase 1 gate).
--
-- Applied via `psql -d omnisell -f infra/db/rls.sql` or inside the initial
-- migration. Each tenant-scoped table reads the app.tenant_id / app.user_id
-- session variables set by TenantScopedRepository.withTenantContext (or the
-- request-scoped equivalent) via `set_config`, transaction-local.
-- =========================================================================

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.tenant_id() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT COALESCE(current_setting('app.tenant_id', true), '')::text; $$;

CREATE OR REPLACE FUNCTION app.user_id() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS
$$ SELECT COALESCE(current_setting('app.user_id', true), '')::text; $$;

ALTER TABLE "Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfaSecret" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailVerificationToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlagTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Wallet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PointTransaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PointEarningRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoContent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VideoWatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductPurchaseWithPoints" ENABLE ROW LEVEL SECURITY;
-- `TenantPointSettings` was missing from this file despite the Phase 0 schema
-- scaffold already carrying its tenantId column — closed this pass (Phase 4.5).
ALTER TABLE "TenantPointSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MfaRecoveryCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyRecord" ENABLE ROW LEVEL SECURITY;

-- Phase 2 — Studio & Catalog (all strictly tenant-scoped; see
-- docs/OPEN_QUESTIONS.md for why Blueprint is tenant-scoped rather than
-- global despite being a provider-catalog CACHE).
ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Asset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssetUploadSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PreflightReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Collection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CollectionAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Blueprint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlueprintVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariantPrice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DesignPlacement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlacementTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PricingRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MockupTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MockupRender" ENABLE ROW LEVEL SECURITY;
-- `FxRate` is a global market-fact cache (no tenantId column) — deliberately
-- NOT RLS-enabled, same reasoning as `ConnectorDefinition`/`FeatureFlag`.

DO $$ BEGIN
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Folder');
  CREATE POLICY tenant_isolation ON "Folder"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Asset');
  CREATE POLICY tenant_isolation ON "Asset"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'AssetVersion');
  CREATE POLICY tenant_isolation ON "AssetVersion"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'AssetUploadSession');
  CREATE POLICY tenant_isolation ON "AssetUploadSession"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'PreflightReport');
  CREATE POLICY tenant_isolation ON "PreflightReport"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Collection');
  CREATE POLICY tenant_isolation ON "Collection"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'CollectionAsset');
  CREATE POLICY tenant_isolation ON "CollectionAsset"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Blueprint');
  CREATE POLICY tenant_isolation ON "Blueprint"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'BlueprintVariant');
  CREATE POLICY tenant_isolation ON "BlueprintVariant"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ProductVariant');
  CREATE POLICY tenant_isolation ON "ProductVariant"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'VariantPrice');
  CREATE POLICY tenant_isolation ON "VariantPrice"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'DesignPlacement');
  CREATE POLICY tenant_isolation ON "DesignPlacement"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'PlacementTemplate');
  CREATE POLICY tenant_isolation ON "PlacementTemplate"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'PricingRule');
  CREATE POLICY tenant_isolation ON "PricingRule"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'MockupTemplate');
  CREATE POLICY tenant_isolation ON "MockupTemplate"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'MockupRender');
  CREATE POLICY tenant_isolation ON "MockupRender"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
END $$;

-- `FeatureFlag` itself is global (no tenantId column) — deliberately NOT
-- RLS-enabled; only its per-tenant `FeatureFlagTarget` rows are scoped.

-- Catalog / points tables are strictly tenant-scoped.
DO $$ BEGIN
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Wallet');
  CREATE POLICY tenant_isolation ON "Wallet"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'PointTransaction');
  CREATE POLICY tenant_isolation ON "PointTransaction"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'PointEarningRule');
  CREATE POLICY tenant_isolation ON "PointEarningRule"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'VideoContent');
  CREATE POLICY tenant_isolation ON "VideoContent"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'VideoWatch');
  CREATE POLICY tenant_isolation ON "VideoWatch"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ProductPurchaseWithPoints');
  CREATE POLICY tenant_isolation ON "ProductPurchaseWithPoints"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'TenantPointSettings');
  CREATE POLICY tenant_isolation ON "TenantPointSettings"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Product');
  CREATE POLICY tenant_isolation ON "Product"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ApiKey');
  CREATE POLICY tenant_isolation ON "ApiKey"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'FeatureFlagTarget');
  CREATE POLICY tenant_isolation ON "FeatureFlagTarget"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Invite');
  CREATE POLICY tenant_isolation ON "Invite"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
END $$;

-- Tenant: a caller only sees the tenant that is the active context of the
-- current request/transaction (conservative default — one tenant per
-- request; org-switcher issues a fresh context per selection).
DROP POLICY IF EXISTS tenant_isolation ON "Tenant";
CREATE POLICY tenant_isolation ON "Tenant"
  USING (id = app.tenant_id())
  WITH CHECK (id = app.tenant_id());

-- Memberships unlock within the authenticated tenant; a user only ever
-- reads/writes their own membership rows.
DROP POLICY IF EXISTS tenant_isolation ON "Membership";
CREATE POLICY tenant_isolation ON "Membership"
  USING ("tenantId" = app.tenant_id() AND "userId" = app.user_id())
  WITH CHECK ("tenantId" = app.tenant_id() AND "userId" = app.user_id());

-- User: visible to itself always (auth/profile flows are tenant-free), and
-- to any caller who shares an active membership with that user inside the
-- caller's current tenant context (member-management UI, Phase 1.6).
-- Conservative default recorded in docs/OPEN_QUESTIONS.md — revisit if a
-- future feature needs cross-tenant user lookups (it should not).
DROP POLICY IF EXISTS self_or_tenant_peer ON "User";
CREATE POLICY self_or_tenant_peer ON "User"
  USING (
    id = app.user_id()
    OR EXISTS (
      SELECT 1 FROM "Membership" m
      WHERE m."userId" = "User".id AND m."tenantId" = app.tenant_id()
    )
  )
  WITH CHECK (id = app.user_id());

-- Session / MfaSecret / verification & reset tokens: strictly self-scoped,
-- tenant-independent (identity data predates any tenant context).
DROP POLICY IF EXISTS self_only ON "Session";
CREATE POLICY self_only ON "Session"
  USING ("userId" = app.user_id())
  WITH CHECK ("userId" = app.user_id());

DROP POLICY IF EXISTS self_only ON "MfaSecret";
CREATE POLICY self_only ON "MfaSecret"
  USING ("userId" = app.user_id())
  WITH CHECK ("userId" = app.user_id());

DROP POLICY IF EXISTS self_only ON "EmailVerificationToken";
CREATE POLICY self_only ON "EmailVerificationToken"
  USING ("userId" = app.user_id())
  WITH CHECK ("userId" = app.user_id());

DROP POLICY IF EXISTS self_only ON "PasswordResetToken";
CREATE POLICY self_only ON "PasswordResetToken"
  USING ("userId" = app.user_id())
  WITH CHECK ("userId" = app.user_id());

DROP POLICY IF EXISTS self_only ON "MfaRecoveryCode";
CREATE POLICY self_only ON "MfaRecoveryCode"
  USING ("userId" = app.user_id())
  WITH CHECK ("userId" = app.user_id());

DROP POLICY IF EXISTS self_only ON "OAuthAccount";
CREATE POLICY self_only ON "OAuthAccount"
  USING ("userId" = app.user_id())
  WITH CHECK ("userId" = app.user_id());

-- Notification / NotificationPreference: a user only ever sees their own rows,
-- scoped within their active tenant context (same shape as Membership).
DROP POLICY IF EXISTS tenant_and_self ON "Notification";
CREATE POLICY tenant_and_self ON "Notification"
  USING ("tenantId" = app.tenant_id() AND "userId" = app.user_id())
  WITH CHECK ("tenantId" = app.tenant_id() AND "userId" = app.user_id());

DROP POLICY IF EXISTS tenant_and_self ON "NotificationPreference";
CREATE POLICY tenant_and_self ON "NotificationPreference"
  USING ("tenantId" = app.tenant_id() AND "userId" = app.user_id())
  WITH CHECK ("tenantId" = app.tenant_id() AND "userId" = app.user_id());

-- IdempotencyRecord: ownerId is a tenantId, a userId, or the literal "global"
-- depending on the call site (apps/api/src/common/idempotency) — readable if it
-- matches either identity in the caller's current context.
DROP POLICY IF EXISTS owner_scoped ON "IdempotencyRecord";
CREATE POLICY owner_scoped ON "IdempotencyRecord"
  USING ("ownerId" = app.tenant_id() OR "ownerId" = app.user_id())
  WITH CHECK ("ownerId" = app.tenant_id() OR "ownerId" = app.user_id());

-- AuditLog: tenantId is nullable (system-level entries have no tenant).
-- Readable within the active tenant context, or system-wide entries
-- (tenantId IS NULL) which only a platform-admin connection role should
-- reach in practice — enforced at the service layer, RLS is defence-in-depth.
DROP POLICY IF EXISTS tenant_or_system ON "AuditLog";
CREATE POLICY tenant_or_system ON "AuditLog"
  USING ("tenantId" = app.tenant_id() OR "tenantId" IS NULL)
  WITH CHECK ("tenantId" = app.tenant_id() OR "tenantId" IS NULL);

-- Phase 3 — Connector Framework (implentationplanphase.md). `ConnectorDefinition`
-- and `ConnectorVersion` are the deliberate global exception (no tenantId
-- column at all — same reasoning as FeatureFlag/FxRate) and are therefore NOT
-- RLS-enabled here. Every OTHER Phase 3 table carries tenantId and gets the
-- same tenant_isolation policy as every prior phase's tenant-scoped tables —
-- this is the second line of defence behind TenantScopedRepository for the
-- credential vault, which is the single most sensitive data in this schema.
ALTER TABLE "TenantDataKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Connection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Credential" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectorOAuthState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectionHealthSample" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'TenantDataKey');
  CREATE POLICY tenant_isolation ON "TenantDataKey"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Connection');
  CREATE POLICY tenant_isolation ON "Connection"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Credential');
  CREATE POLICY tenant_isolation ON "Credential"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ConnectorOAuthState');
  CREATE POLICY tenant_isolation ON "ConnectorOAuthState"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ConnectionHealthSample');
  CREATE POLICY tenant_isolation ON "ConnectionHealthSample"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
END $$;

-- Phase 4 — Publishing Pipeline & Export Packs (implentationplanphase.md).
-- `BannedTerm` is the deliberate global exception here (no tenantId column —
-- same reasoning as ConnectorDefinition/FeatureFlag/FxRate: one dictionary,
-- every tenant lints against it identically) and is therefore NOT RLS-enabled.
-- Every other Phase 4 table carries tenantId and gets the same
-- tenant_isolation policy as every prior phase's tenant-scoped tables.
ALTER TABLE "Listing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingFieldOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ListingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncJobItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExportPack" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExportPackItem" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Listing');
  CREATE POLICY tenant_isolation ON "Listing"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ListingVariant');
  CREATE POLICY tenant_isolation ON "ListingVariant"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ListingFieldOverride');
  CREATE POLICY tenant_isolation ON "ListingFieldOverride"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ListingEvent');
  CREATE POLICY tenant_isolation ON "ListingEvent"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'SyncJob');
  CREATE POLICY tenant_isolation ON "SyncJob"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'SyncJobItem');
  CREATE POLICY tenant_isolation ON "SyncJobItem"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ExportPack');
  CREATE POLICY tenant_isolation ON "ExportPack"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'ExportPackItem');
  CREATE POLICY tenant_isolation ON "ExportPackItem"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
END $$;

-- Phase 4.5 — Points Economy: minimal ledger primitive (prompt.md "CONSUMER
-- MODE" section / docs/points-extension.md §7.4). Phase 6 extends these two
-- tables; the tenant_isolation policy shape does not change when it does.
ALTER TABLE "LedgerEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LedgerLine" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'LedgerEntry');
  CREATE POLICY tenant_isolation ON "LedgerEntry"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'LedgerLine');
  CREATE POLICY tenant_isolation ON "LedgerLine"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
END $$;

-- Phase 5 -- Orders, Fulfilment & Digital Delivery (implentationplanphase.md tasks
-- 5.1-5.11). Same tenant_isolation policy shape as every prior phase; RLS is the
-- second line of defence behind TenantScopedRepository (prompt.md constraint #4).
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderWebhookEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderPollCursor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderFee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderException" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FulfilmentRoutingRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Fulfilment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrackingEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Return" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reprint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedOrderView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuyerMessageTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuyerMessageLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalProduct" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalFile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DigitalFileVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeliveryLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LicenceKey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LicenceKeyActivation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Coupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouponRedemption" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Order');
  CREATE POLICY tenant_isolation ON "Order"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'OrderItem');
  CREATE POLICY tenant_isolation ON "OrderItem"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'OrderWebhookEvent');
  CREATE POLICY tenant_isolation ON "OrderWebhookEvent"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'OrderPollCursor');
  CREATE POLICY tenant_isolation ON "OrderPollCursor"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'OrderFee');
  CREATE POLICY tenant_isolation ON "OrderFee"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'OrderException');
  CREATE POLICY tenant_isolation ON "OrderException"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'OrderEvent');
  CREATE POLICY tenant_isolation ON "OrderEvent"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'FulfilmentRoutingRule');
  CREATE POLICY tenant_isolation ON "FulfilmentRoutingRule"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Fulfilment');
  CREATE POLICY tenant_isolation ON "Fulfilment"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Shipment');
  CREATE POLICY tenant_isolation ON "Shipment"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'TrackingEvent');
  CREATE POLICY tenant_isolation ON "TrackingEvent"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Return');
  CREATE POLICY tenant_isolation ON "Return"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Refund');
  CREATE POLICY tenant_isolation ON "Refund"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Reprint');
  CREATE POLICY tenant_isolation ON "Reprint"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'SavedOrderView');
  CREATE POLICY tenant_isolation ON "SavedOrderView"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'BuyerMessageTemplate');
  CREATE POLICY tenant_isolation ON "BuyerMessageTemplate"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'BuyerMessageLog');
  CREATE POLICY tenant_isolation ON "BuyerMessageLog"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'DigitalProduct');
  CREATE POLICY tenant_isolation ON "DigitalProduct"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'DigitalFile');
  CREATE POLICY tenant_isolation ON "DigitalFile"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'DigitalFileVersion');
  CREATE POLICY tenant_isolation ON "DigitalFileVersion"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Entitlement');
  CREATE POLICY tenant_isolation ON "Entitlement"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'DeliveryToken');
  CREATE POLICY tenant_isolation ON "DeliveryToken"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'DeliveryLog');
  CREATE POLICY tenant_isolation ON "DeliveryLog"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'LicenceKey');
  CREATE POLICY tenant_isolation ON "LicenceKey"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'LicenceKeyActivation');
  CREATE POLICY tenant_isolation ON "LicenceKeyActivation"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'Coupon');
  CREATE POLICY tenant_isolation ON "Coupon"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
  EXECUTE FORMAT('DROP POLICY IF EXISTS tenant_isolation ON %I', 'CouponRedemption');
  CREATE POLICY tenant_isolation ON "CouponRedemption"
    USING ("tenantId" = app.tenant_id())
    WITH CHECK ("tenantId" = app.tenant_id());
END $$;
