import {describe, expect, it, vi} from 'vitest';
import type {Storefront} from '@shopify/hydrogen';
import {loadProduct} from './product.server';

function mockContext(product: unknown, reference: unknown = null) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({product})
    .mockResolvedValueOnce({product: {line_item_field_set: {reference}}});
  return {
    context: {
      storefront: {
        query,
        CacheNone: () => ({mode: 'no-store'}),
      } as unknown as Storefront,
    },
    query,
  };
}

describe('shared product loading', () => {
  it('loads the same Shopify variant options and custom fields for the gift page', async () => {
    const product = {id: 'board', handle: 'cutting-board'};
    const reference = {__typename: 'Metaobject', fields: [{key: 'engraving'}]};
    const {context, query} = mockContext(product, reference);
    const result = await loadProduct({
      context,
      request: new Request(
        'https://from-trees.com/cutting-boards?Material=Maple&Cutting+Board+Size=8%22+x+11%22',
      ),
      handle: 'cutting-board',
      localizeHandle: false,
    });
    expect(query.mock.calls[0][1].variables).toEqual({
      handle: 'cutting-board',
      selectedOptions: [
        {name: 'Material', value: 'Maple'},
        {name: 'Cutting Board Size', value: '8" x 11"'},
      ],
    });
    expect(query.mock.calls[1][1].cache).toEqual({mode: 'no-store'});
    expect(result).toEqual({
      product,
      lineItemFieldSetReference: reference,
      origin: 'https://from-trees.com',
    });
  });

  it('returns 404 instead of rendering a purchasable placeholder if the board is missing', async () => {
    const {context} = mockContext(null);
    await expect(
      loadProduct({
        context,
        request: new Request('https://from-trees.com/cutting-boards'),
        handle: 'cutting-board',
        localizeHandle: false,
      }),
    ).rejects.toMatchObject({status: 404});
  });

  it('preserves localized redirects on the existing product route', async () => {
    const {context} = mockContext({id: 'board', handle: 'localized-board'});
    await expect(
      loadProduct({
        context,
        request: new Request(
          'https://from-trees.com/products/cutting-board?Material=Maple',
        ),
        handle: 'cutting-board',
      }),
    ).rejects.toMatchObject({status: 302});
  });

  it('keeps the editorial landing URL when Shopify returns a localized handle', async () => {
    const {context} = mockContext({id: 'board', handle: 'localized-board'});
    await expect(
      loadProduct({
        context,
        request: new Request('https://from-trees.com/cutting-boards'),
        handle: 'cutting-board',
        localizeHandle: false,
      }),
    ).resolves.toMatchObject({product: {id: 'board'}});
  });
});
