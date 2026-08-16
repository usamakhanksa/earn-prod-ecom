import { Router } from 'express';
import { productDetailQuerySchema, productListQuerySchema } from '@marketplace/shared';
import { createMarketplaceProviderRegistry } from '../../providers/provider-registry.js';
import { NotFoundError } from '../../middleware/error-handler.js';

export const productsRouter = Router();

const registry = createMarketplaceProviderRegistry();

/**
 * GET /products — real pagination, filtering (category/country/price/
 * rating), and search, per the spec. Every query param is Zod-validated
 * (productListQuerySchema, @marketplace/shared) before it reaches the
 * provider layer.
 */
productsRouter.get('/', async (req, res, next) => {
  try {
    const query = productListQuerySchema.parse(req.query);
    const provider = registry.primary();
    const result = await provider.searchProducts({
      query: query.search,
      categorySlug: query.category,
      countryCode: query.country,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minRating: query.minRating,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

productsRouter.get('/:slug', async (req, res, next) => {
  try {
    const query = productDetailQuerySchema.parse(req.query);
    const provider = registry.primary();
    const product = await provider.getProduct(req.params.slug, query.country);
    if (!product) {
      throw new NotFoundError(`No product found for "${req.params.slug}".`);
    }
    res.status(200).json(product);
  } catch (err) {
    next(err);
  }
});
