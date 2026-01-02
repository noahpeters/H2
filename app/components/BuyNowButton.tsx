import {type FetcherWithComponents} from 'react-router';
import {CartForm, type OptimisticCartLineInput} from '@shopify/hydrogen';
import stylex from '~/lib/stylex';

const styles = stylex.create({
  button: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--color-primary)',
    color: 'var(--color-light)',
    borderStyle: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: 'bold',
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
});

export function BuyNowButton({
  analytics,
  children,
  disabled,
  lines,
  onClick,
}: {
  analytics?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  lines: Array<OptimisticCartLineInput>;
  onClick?: () => void;
}) {
  return (
    <CartForm route="/cart" inputs={{lines}} action={CartForm.ACTIONS.LinesAdd}>
      {(fetcher: FetcherWithComponents<any>) => (
        <>
          <input
            name="analytics"
            type="hidden"
            value={JSON.stringify(analytics)}
          />
          {/* Flag for the cart action to redirect */}
          <input name="buyNow" type="hidden" value="1" />

          <button
            className={stylex(styles.button)}
            type="submit"
            onClick={onClick}
            disabled={disabled ?? fetcher.state !== 'idle'}
          >
            {children}
          </button>
        </>
      )}
    </CartForm>
  );
}
