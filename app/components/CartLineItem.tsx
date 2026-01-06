import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Image, type OptimisticCartLine} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link} from 'react-router';
import {ProductPrice} from './ProductPrice';
import {useAside} from './Aside';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import stylex from '~/lib/stylex';
import {useEffect, useMemo, useState} from 'react';
import {
  mergeAttributes,
  normalizeAttributes,
  parseAttributes,
  isEngravingSelected,
  CUSTOM_ATTRIBUTE_KEYS,
} from '~/lib/cart/lineAttributes';

type CartLine = OptimisticCartLine<CartApiQueryFragment>;

const styles = stylex.create({
  line: {
    display: 'flex',
    padding: '0.75rem 0',
  },
  image: {
    display: 'block',
    height: '100%',
    marginRight: '0.75rem',
  },
  quantity: {
    display: 'flex',
  },
  customization: {
    marginTop: '0.75rem',
  },
  customizationSummary: {
    fontSize: '0.85rem',
    color: 'var(--color-secondary)',
  },
  details: {
    marginTop: '0.5rem',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  editor: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: '0.75rem',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
  },
  label: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  helper: {
    fontSize: '0.8rem',
    color: 'var(--color-secondary)',
  },
  input: {
    padding: '0.45rem 0.6rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-secondary)',
    borderRadius: 6,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
  },
  textarea: {
    padding: '0.45rem 0.6rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-secondary)',
    borderRadius: 6,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    minHeight: '4.5rem',
    resize: 'vertical',
  },
  select: {
    padding: '0.45rem 0.6rem',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--color-secondary)',
    borderRadius: 6,
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    backgroundColor: 'var(--color-light)',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'center',
  },
});

/**
 * A single line item in the cart. It displays the product image, title, price.
 * It also provides controls to update the quantity or remove the line item.
 */
export function CartLineItem({
  layout,
  line,
}: {
  layout: CartLayout;
  line: CartLine;
}) {
  const {id, merchandise} = line;
  const {product, title, image, selectedOptions} = merchandise;
  const lineItemUrl = useVariantUrl(product.handle, selectedOptions);
  const {close} = useAside();
  const engravingEnabled = isEngravingSelected(selectedOptions);
  const helperText = 'Select Engraving to add text or a logo.';
  const parsedAttributes = useMemo(
    () => parseAttributes(line.attributes),
    [line.attributes],
  );
  const [engravingText, setEngravingText] = useState(
    parsedAttributes.engravingText,
  );
  const [logoUrl, setLogoUrl] = useState(parsedAttributes.logoUrl);
  const [color, setColor] = useState(parsedAttributes.color);
  const [notes, setNotes] = useState(parsedAttributes.notes);

  useEffect(() => {
    setEngravingText(parsedAttributes.engravingText);
    setLogoUrl(parsedAttributes.logoUrl);
    setColor(parsedAttributes.color);
    setNotes(parsedAttributes.notes);
  }, [parsedAttributes]);

  const summaryParts = [
    engravingText ? `${CUSTOM_ATTRIBUTE_KEYS.engravingText}: ${engravingText}` : null,
    logoUrl ? `${CUSTOM_ATTRIBUTE_KEYS.logoUrl}: ${logoUrl}` : null,
    color ? `${CUSTOM_ATTRIBUTE_KEYS.color}: ${color}` : null,
    notes ? `${CUSTOM_ATTRIBUTE_KEYS.notes}: ${notes}` : null,
  ].filter(Boolean);

  const attributesUpdate = mergeAttributes(
    line.attributes,
    normalizeAttributes({
      engravingText,
      logoUrl,
      color,
      notes,
    }),
  );
  const clearAttributes = mergeAttributes(line.attributes, []);

  return (
    <li key={id} className={stylex(styles.line)}>
      {image && (
        <Image
          alt={title}
          aspectRatio="1/1"
          data={image}
          height={100}
          loading="lazy"
          width={100}
          className={stylex(styles.image)}
        />
      )}

      <div>
        <Link
          prefetch="intent"
          to={lineItemUrl}
          onClick={() => {
            if (layout === 'aside') {
              close();
            }
          }}
        >
          <p>
            <strong>{product.title}</strong>
          </p>
        </Link>
        <ProductPrice price={line?.cost?.totalAmount} />
        <ul>
          {selectedOptions.map((option) => (
            <li key={option.name}>
              <small>
                {option.name}: {option.value}
              </small>
            </li>
          ))}
        </ul>
        <div className={stylex(styles.customization)}>
          {summaryParts.length ? (
            <div className={stylex(styles.customizationSummary)}>
              {summaryParts.join(' · ')}
            </div>
          ) : null}
          <details className={stylex(styles.details)}>
            <summary className={stylex(styles.summary)}>
              Edit customization
            </summary>
            <div className={stylex(styles.editor)}>
              <div className={stylex(styles.row)}>
                <span className={stylex(styles.label)}>Engraving Text</span>
                <input
                  className={stylex(styles.input)}
                  type="text"
                  value={engravingText}
                  onChange={(event) => setEngravingText(event.target.value)}
                  disabled={!engravingEnabled}
                  placeholder="Up to 25 characters"
                />
                {!engravingEnabled ? (
                  <span className={stylex(styles.helper)}>{helperText}</span>
                ) : null}
              </div>
              <div className={stylex(styles.row)}>
                <span className={stylex(styles.label)}>Engraving Logo URL</span>
                <input
                  className={stylex(styles.input)}
                  type="url"
                  inputMode="url"
                  value={logoUrl}
                  onChange={(event) => setLogoUrl(event.target.value)}
                  disabled={!engravingEnabled}
                  placeholder="https://example.com/logo.png"
                />
                {!engravingEnabled ? (
                  <span className={stylex(styles.helper)}>{helperText}</span>
                ) : (
                  <span className={stylex(styles.helper)}>
                    TODO: replace with an upload flow that returns a public URL.
                  </span>
                )}
              </div>
              <div className={stylex(styles.row)}>
                <span className={stylex(styles.label)}>Color (optional)</span>
                <select
                  className={stylex(styles.select)}
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                >
                  <option value="">Select color</option>
                  <option value="Natural">Natural</option>
                  <option value="Light">Light</option>
                  <option value="Medium">Medium</option>
                  <option value="Dark">Dark</option>
                </select>
              </div>
              <div className={stylex(styles.row)}>
                <span className={stylex(styles.label)}>Customer Notes</span>
                <textarea
                  className={stylex(styles.textarea)}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Anything else we should know?"
                />
              </div>
              <div className={stylex(styles.actions)}>
                <CartLineUpdateButton
                  lines={[{id, attributes: attributesUpdate}]}
                >
                  <button type="submit">Save</button>
                </CartLineUpdateButton>
                <CartLineUpdateButton
                  lines={[{id, attributes: clearAttributes}]}
                >
                  <button type="submit">Clear</button>
                </CartLineUpdateButton>
              </div>
            </div>
          </details>
        </div>
        <CartLineQuantity line={line} />
      </div>
    </li>
  );
}

/**
 * Provides the controls to update the quantity of a line item in the cart.
 * These controls are disabled when the line item is new, and the server
 * hasn't yet responded that it was successfully added to the cart.
 */
function CartLineQuantity({line}: {line: CartLine}) {
  if (!line || typeof line?.quantity === 'undefined') return null;
  const {id: lineId, quantity, isOptimistic} = line;
  const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
  const nextQuantity = Number((quantity + 1).toFixed(0));

  return (
    <div className={stylex(styles.quantity)}>
      <small>Quantity: {quantity} &nbsp;&nbsp;</small>
      <CartLineUpdateButton lines={[{id: lineId, quantity: prevQuantity}]}>
        <button
          aria-label="Decrease quantity"
          disabled={quantity <= 1 || !!isOptimistic}
          name="decrease-quantity"
          value={prevQuantity}
        >
          <span>&#8722; </span>
        </button>
      </CartLineUpdateButton>
      &nbsp;
      <CartLineUpdateButton lines={[{id: lineId, quantity: nextQuantity}]}>
        <button
          aria-label="Increase quantity"
          name="increase-quantity"
          value={nextQuantity}
          disabled={!!isOptimistic}
        >
          <span>&#43;</span>
        </button>
      </CartLineUpdateButton>
      &nbsp;
      <CartLineRemoveButton lineIds={[lineId]} disabled={!!isOptimistic} />
    </div>
  );
}

/**
 * A button that removes a line item from the cart. It is disabled
 * when the line item is new, and the server hasn't yet responded
 * that it was successfully added to the cart.
 */
function CartLineRemoveButton({
  lineIds,
  disabled,
}: {
  lineIds: string[];
  disabled: boolean;
}) {
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button disabled={disabled} type="submit">
        Remove
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
  const lineIds = lines.map((line) => line.id);

  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

/**
 * Returns a unique key for the update action. This is used to make sure actions modifying the same line
 * items are not run concurrently, but cancel each other. For example, if the user clicks "Increase quantity"
 * and "Decrease quantity" in rapid succession, the actions will cancel each other and only the last one will run.
 * @param lineIds - line ids affected by the update
 * @returns
 */
function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
