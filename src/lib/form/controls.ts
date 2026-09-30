import type { Field } from './types';

/** A `select` with this many options or fewer is rendered as segmented radio buttons. */
export const SEGMENTED_MAX_OPTIONS = 3;

export type SelectVariant = 'segmented' | 'native';

/** Which control renders a `select` field: short lists as segmented buttons, longer ones as a styled native select. */
export function selectVariant(field: Field): SelectVariant {
  return (field.options?.length ?? 0) <= SEGMENTED_MAX_OPTIONS ? 'segmented' : 'native';
}
