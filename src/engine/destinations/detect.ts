import { ADAPTERS } from './adapters';
import type { DestinationAdapter, DestinationId, PasteTarget } from './types';

const SITE_RULES: [RegExp, DestinationId][] = [
  [/^docs\.google\.com$/, 'google-docs'],
  [/^mail\.google\.com$/, 'gmail'],
  [/^app\.slack\.com$|\.slack\.com$/, 'slack'],
  [/(^|\.)notion\.so$|\.notion\.site$/, 'notion'],
];

export function isDestinationId(value: string | undefined): value is DestinationId {
  return !!value && value in ADAPTERS;
}

/** Which adapter a site would use for rich content, ignoring the specific field. */
export function destinationForHost(hostname: string): DestinationAdapter {
  const rule = SITE_RULES.find(([pattern]) => pattern.test(hostname));
  return ADAPTERS[rule?.[1] ?? 'rich'];
}

/**
 * Pick the adapter for a paste target. Returns null when Magic Paste should
 * stay out of the way entirely (code editors).
 */
export function detectDestination(target: PasteTarget, destinationAware = true): DestinationAdapter | null {
  if (target.codeEditor) return null;
  if (isDestinationId(target.override)) return ADAPTERS[target.override];
  if (target.kind !== 'rich') return ADAPTERS.plain;
  return destinationAware ? destinationForHost(target.hostname) : ADAPTERS.rich;
}
