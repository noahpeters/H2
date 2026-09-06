export const CONTACT_CONSENT =
  'From Trees may contact me about my cabinet project';
export type ShareDetails = {
  senderName: string;
  senderEmail: string;
  recipientName: string;
  recipientEmail: string;
  consent: boolean;
  requestId: string;
  slug: string;
  editKey: string;
  revision: number;
};
export function validShare(value: any): value is ShareDetails {
  const name = (v: unknown) =>
    typeof v === 'string' &&
    v.trim().length > 0 &&
    v.length <= 100 &&
    !/[\r\n]/.test(v);
  const email = (v: unknown) =>
    typeof v === 'string' &&
    v.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  return (
    !!value &&
    name(value.senderName) &&
    name(value.recipientName) &&
    email(value.senderEmail) &&
    email(value.recipientEmail) &&
    typeof value.consent === 'boolean' &&
    typeof value.requestId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value.requestId,
    ) &&
    typeof value.slug === 'string' &&
    /^[a-f0-9]{32}$/.test(value.slug) &&
    typeof value.editKey === 'string' &&
    value.editKey.length <= 100 &&
    Number.isInteger(value.revision)
  );
}
