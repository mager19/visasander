export type Answers = Record<string, unknown>;
export type FieldType =
  | 'text' | 'tel' | 'email' | 'date' | 'select' | 'yesno' | 'textarea' | 'number'
  | 'multiselect' | 'co_department' | 'co_city';
export interface Option { value: string; label: string }
/**
 * Visibility condition on another answer. `in` / `notIn` compare the whole value;
 * `includes` checks a comma-separated (multiselect) answer for one value.
 */
export interface Condition { key: string; in?: string[]; notIn?: string[]; includes?: string }
/** Allowed date window relative to "today". Omitted side = unbounded; 0 = today is the limit. */
export interface DateRange { yearsBack?: number; yearsForward?: number }
export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: Option[];
  showIf?: Condition;
  /** Date field that must be strictly later than the date stored under this key. */
  after?: string;
  /** Custom message when `after` is violated. */
  afterMessage?: string;
  range?: DateRange;
  /** For `co_city`: key of the `co_department` answer the city must belong to. */
  dependsOn?: string;
  /** Preselected value for the UI; it is only counted as answered once the screen is saved. */
  default?: string;
  placeholder?: string;
  hint?: string;
  /** Digits-only value (spaces and dashes are ignored) whose length must fall in [min, max]. */
  digits?: { min: number; max: number };
}
export interface RepeatSpec { key: string; addLabel: string }
export interface Screen { id: string; title: string; fields: Field[]; showIf?: Condition; repeat?: RepeatSpec }
export interface Chapter { id: string; title: string; screens: Screen[] }
