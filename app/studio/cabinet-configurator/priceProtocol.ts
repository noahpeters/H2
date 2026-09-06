import {validShare, type ShareDetails} from './shareProtocol';
export type PriceRequest = Omit<
  ShareDetails,
  'recipientName' | 'recipientEmail'
>;
export function validPriceRequest(value: unknown): value is PriceRequest {
  if (!value || typeof value !== 'object') return false;
  const contact = value as Record<string, unknown>;
  return validShare({
    ...contact,
    recipientName: contact.senderName,
    recipientEmail: contact.senderEmail,
  });
}
export type PriceEstimate = {
  currency: 'USD';
  range: {low: number; high: number};
  scope: string;
  exclusions: string[];
  assumptions: string[];
  estimateOnly: boolean;
};
