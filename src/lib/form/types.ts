export type Answers = Record<string, unknown>;
export type FieldType = 'text' | 'tel' | 'email' | 'date' | 'select' | 'yesno' | 'textarea' | 'number';
export interface Option { value: string; label: string }
export interface Condition { key: string; in?: string[]; notIn?: string[] }
export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: Option[];
  showIf?: Condition;
  /** Date field that must be strictly later than the date stored under this key. */
  after?: string;
  hint?: string;
}
export interface RepeatSpec { key: string; addLabel: string }
export interface Screen { id: string; title: string; fields: Field[]; showIf?: Condition; repeat?: RepeatSpec }
export interface Chapter { id: string; title: string; screens: Screen[] }
