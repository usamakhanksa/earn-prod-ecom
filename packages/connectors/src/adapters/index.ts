import type { ConnectorAdapter } from '../adapter';
import { printfulAdapter } from './printful';
import { printifyAdapter } from './printify';
import { gelatoAdapter } from './gelato';
import { prodigiAdapter } from './prodigi';
import { etsyAdapter } from './etsy';
import { shopifyAdapter } from './shopify';
import { woocommerceAdapter } from './woocommerce';
import { gumroadAdapter } from './gumroad';
import { payhipAdapter } from './payhip';
import { sellfyAdapter } from './sellfy';

export { printfulAdapter } from './printful';
export { printifyAdapter } from './printify';
export { gelatoAdapter } from './gelato';
export { prodigiAdapter } from './prodigi';
export { etsyAdapter } from './etsy';
export { shopifyAdapter } from './shopify';
export { woocommerceAdapter } from './woocommerce';
export { gumroadAdapter } from './gumroad';
export { payhipAdapter } from './payhip';
export { sellfyAdapter } from './sellfy';

/**
 * Ten adapters exist as real code as of this pass — the original four
 * (implentationplanphase.md Phase 3 task 3.7: printful/printify/gelato/
 * prodigi) plus six more added in a bounded follow-up pass (Etsy/Shopify/
 * WooCommerce/Gumroad/Payhip/Sellfy — see docs/CONNECTORS.md's "Six more
 * adapters" section and docs/DEBT.md). Every other `ConnectorDefinition` row
 * in the registry (Tier B/C/D, and the remainder of the wave-2 Tier A list)
 * has NO entry here, by design (prompt.md constraint #2 — no adapter
 * without a confirmed live API doc URL). Looking a slug up here and getting
 * `undefined` is the correct, honest outcome for every connector this phase
 * does not implement.
 */
export const ADAPTER_REGISTRY: Readonly<Record<string, ConnectorAdapter>> = {
  printful: printfulAdapter,
  printify: printifyAdapter,
  gelato: gelatoAdapter,
  prodigi: prodigiAdapter,
  etsy: etsyAdapter,
  shopify: shopifyAdapter,
  woocommerce: woocommerceAdapter,
  gumroad: gumroadAdapter,
  payhip: payhipAdapter,
  sellfy: sellfyAdapter,
};

export function getAdapter(slug: string): ConnectorAdapter | undefined {
  return ADAPTER_REGISTRY[slug];
}
