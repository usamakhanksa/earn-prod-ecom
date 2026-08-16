import { Router } from 'express';
import { categoryListQuerySchema, productDetailQuerySchema } from '@marketplace/shared';
import { createMarketplaceProviderRegistry } from '../../providers/provider-registry.js';
import { NotFoundError } from '../../middleware/error-handler.js';

export const categoriesRouter = Router();

const registry = createMarketplaceProviderRegistry();

/**
 * GET /categories?country=XX — real filtering against seeded data via the
 * country product rule engine (packages/marketplace-country's
 * CountryProductRulesService, invoked inside MockMarketplaceProvider). No
 * `if (country === 'SA')` branch exists here or in the provider.
 */
categoriesRouter.get('/', async (req, res, next) => {
  try {
    const query = categoryListQuerySchema.parse(req.query);
    const provider = registry.primary();
    const categories = await provider.getCategories(query.country);
    res.status(200).json(categories);
  } catch (err) {
    next(err);
  }
});

categoriesRouter.get('/:slug', async (req, res, next) => {
  try {
    const query = productDetailQuerySchema.parse(req.query);
    const provider = registry.primary();

    // Look up existence against the unfiltered list first, so "category
    // doesn't exist" (404) is never confused with "category exists but is
    // restricted in this country" (200 + isAvailable:false).
    const allCategories = await provider.getCategories();
    const category = allCategories.find((c) => c.slug === req.params.slug);
    if (!category) {
      throw new NotFoundError(`No category found for "${req.params.slug}".`);
    }

    if (query.country) {
      const availableInCountry = await provider.getCategories(query.country);
      const isAvailable = availableInCountry.some((c) => c.slug === category.slug);
      res.status(200).json({ ...category, isAvailable });
      return;
    }

    res.status(200).json(category);
  } catch (err) {
    next(err);
  }
});
