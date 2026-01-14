import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import SiteHero from '~/components/SiteHero';

const baseItem = {
  id: 'hero-1',
  handle: 'hero-1',
  fields: [
    {
      key: 'text',
      value: 'Hello from the hero.',
    },
    {
      key: 'desktop_image',
      reference: {
        __typename: 'MediaImage' as const,
        image: {
          url: 'https://example.com/desktop.jpg',
          altText: 'Desktop hero',
          width: 1600,
          height: 900,
        },
      },
    },
    {
      key: 'mobile_image',
      reference: {
        __typename: 'MediaImage' as const,
        image: {
          url: 'https://example.com/mobile.jpg',
          altText: 'Mobile hero',
          width: 800,
          height: 1200,
        },
      },
    },
  ],
};

describe('SiteHero', () => {
  it('renders plain text and image for a slide', () => {
    render(
      <MemoryRouter>
        <SiteHero items={[baseItem]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Hello from the hero.')).toBeInTheDocument();
    expect(screen.getByAltText('Desktop hero')).toBeInTheDocument();
  });

  it('links to a product when present', () => {
    const withProduct = {
      ...baseItem,
      id: 'hero-2',
      fields: [
        ...baseItem.fields,
        {
          key: 'product',
          reference: {
            __typename: 'Product' as const,
            handle: 'test-product',
            title: 'Test Product',
          },
        },
      ],
    };

    render(
      <MemoryRouter>
        <SiteHero items={[withProduct]} />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', {name: 'View Test Product'});
    expect(link).toHaveAttribute('href', '/products/test-product');
    expect(screen.getByText('View')).toBeInTheDocument();
  });
});
