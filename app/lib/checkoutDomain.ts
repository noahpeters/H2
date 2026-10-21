/** Prefer the shop's primary domain to keep checkout consent on its own domain. */
export function getCheckoutDomain(
  env: {PUBLIC_CHECKOUT_DOMAIN?: string; PUBLIC_STORE_DOMAIN?: string},
  primaryDomainUrl?: string,
) {
  const configured = env.PUBLIC_CHECKOUT_DOMAIN?.trim();
  if (configured) return configured;

  if (primaryDomainUrl) {
    try {
      return new URL(primaryDomainUrl).hostname;
    } catch {
      // Keep the canonical Shopify store available if the primary URL is absent
      // or invalid. Do not derive checkout destinations from a request header.
    }
  }
  return env.PUBLIC_STORE_DOMAIN?.trim() || undefined;
}
