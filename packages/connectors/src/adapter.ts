import type {
  AuthCtx,
  AutomatableConnector,
  Blueprint,
  Connector,
  CostQuote,
  Ctx,
  DateRange,
  EarningsRow,
  ExportPackSpec,
  Fulfilment,
  FulfilInput,
  HealthResult,
  NormalisedEvent,
  NormalisedOrder,
  Page,
  PublishInput,
  PublishResult,
  RawWebhook,
  RemoteListingState,
  TokenSet,
  UpdateInput,
  ConnectorError,
} from './types';

export type { Connector, AutomatableConnector } from './types';

/**
 * `ConnectorAdapter` — implemented exactly per prompt.md's "CONNECTOR SDK" section.
 *
 * `publish`/`update`/`unpublish` are typed optional here (an adapter only implements
 * what its capabilities declare) but the ENFORCEMENT boundary is not "did the adapter
 * happen to implement publish" — it is the free-standing `publish()` function below,
 * which only accepts an `AutomatableConnector`. A Tier C connector object can never be
 * upcast to `AutomatableConnector` because `capabilities.canAutomate` is `false`, not
 * the literal `true` the intersection type requires — TypeScript rejects the call at
 * the call site, before anything runs. See `test/automation-boundary.test.ts`.
 */
export interface ConnectorAdapter {
  readonly slug: string;
  readonly capabilities: import('@omnisell/shared').ConnectorCapabilities;

  // Auth
  buildAuthUrl?(ctx: AuthCtx): string;
  exchangeCode?(ctx: AuthCtx, code: string): Promise<TokenSet>;
  refresh?(ctx: AuthCtx, t: TokenSet): Promise<TokenSet>;
  verifyCredentials(ctx: Ctx): Promise<HealthResult>;

  // Catalog
  fetchBlueprints?(ctx: Ctx): Promise<Blueprint[]>;
  fetchCosts?(ctx: Ctx, ids: string[]): Promise<CostQuote[]>;

  // Publishing (only present when capabilities.canAutomate === true)
  publish?(ctx: Ctx, input: PublishInput): Promise<PublishResult>;
  update?(ctx: Ctx, input: UpdateInput): Promise<PublishResult>;
  unpublish?(ctx: Ctx, externalId: string): Promise<void>;
  /**
   * Phase 4 (implentationplanphase.md task 4.4) — the EXACT wire payload
   * `publish`/`update` would send, with no HTTP call. Every Tier A/B adapter
   * that implements `publish` implements this too, and `publish`/`update`
   * call it internally — the dry-run endpoint and the real publish path
   * share this one function, so a dry-run preview can never drift from what
   * actually gets sent (prompt.md's "shows exactly what each channel will
   * receive" trust requirement, featureslist.md 5.5).
   */
  buildPublishPayload?(ctx: Ctx, input: PublishInput): unknown;

  // Orders
  pullOrders?(ctx: Ctx, cursor?: string): Promise<Page<NormalisedOrder>>;
  handleWebhook?(ctx: Ctx, req: RawWebhook): Promise<NormalisedEvent[]>;
  submitFulfilment?(ctx: Ctx, input: FulfilInput): Promise<Fulfilment>;

  // Money
  fetchEarnings?(ctx: Ctx, range: DateRange): Promise<EarningsRow[]>;

  // Tier C
  buildExportPack?(ctx: Ctx, input: PublishInput): Promise<ExportPackSpec>;

  /**
   * Phase 4 (implentationplanphase.md task 4.13) — the channel's live view of
   * one already-published listing, for drift detection. Optional and, as of
   * this phase, NOT implemented by any of the four real adapters: none of
   * Printful/Printify/Gelato/Prodigi's live-confirmed docs (docs/CONNECTORS.md)
   * were re-verified this pass for a single-listing "get" endpoint's exact
   * field shape, and prompt.md constraint #2 forbids guessing one. This is a
   * real, honest, forward-looking seam (same pattern as Phase 2's
   * `ProductsService.assertNoLiveDependencies`) — `DriftDetectionService`
   * degrades to an honest "not supported" result when it is undefined, never
   * a fabricated comparison.
   */
  fetchListingState?(ctx: Ctx, externalId: string): Promise<RemoteListingState | null>;

  mapError(e: unknown): ConnectorError;
}

/**
 * THE type-level Tier C boundary (prompt.md constraint #1 / implentationplanphase.md's
 * Phase 3 gate: "the AutomatableConnector type constraint must compile-block Tier C
 * automation before any Tier C connector row exists"). `publish` is the one function
 * every automation call path must go through — it is impossible to satisfy this
 * signature with a connector object whose `capabilities.canAutomate` is anything other
 * than the literal `true`. There is no cast, no `as`, no runtime flag that bypasses it;
 * the only way to call this with a Tier C connector is to lie to the type checker with
 * `as unknown as AutomatableConnector`, which prompt.md's "THINGS THAT WILL BE REJECTED
 * IN REVIEW" list separately forbids everywhere in this codebase.
 */
export function publish(connector: AutomatableConnector, adapter: ConnectorAdapter, ctx: Ctx, input: PublishInput): Promise<PublishResult> {
  if (connector.tier === 'C' || adapter.publish === undefined) {
    // Unreachable by construction — kept as a final runtime tripwire, not the real gate.
    throw new Error(`Refusing to automate connector "${connector.slug}": no publish() available`);
  }
  return adapter.publish(ctx, input);
}

export function canAutomate(connector: Connector): connector is AutomatableConnector {
  return connector.capabilities.canAutomate === true;
}

/** Narrows a `ConnectorAdapter` the same way — used by callers that already have an
 * adapter instance and need to know whether it is legal to reach for `publish`. */
export function isAutomatable(connector: Connector, adapter: ConnectorAdapter): adapter is ConnectorAdapter & { publish: NonNullable<ConnectorAdapter['publish']> } {
  return canAutomate(connector) && adapter.publish !== undefined;
}
