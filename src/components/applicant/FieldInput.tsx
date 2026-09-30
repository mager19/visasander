import { useState } from 'react';
import { selectVariant } from '@/lib/form/controls';
import type { Answers, Field } from '@/lib/form/types';
import { dateBounds, fieldWarnings } from '@/lib/form/zod';
import { ChipsField } from './ChipsField';
import { CityField, DepartmentField } from './ColombiaFields';
import { DateField } from './DateField';
import { FieldShell, idsFor, type ControlA11y } from './FieldShell';
import { SegmentedField } from './SegmentedField';
import { SelectField } from './SelectField';

interface Props {
  field: Field;
  value: string;
  error?: string;
  onChange: (v: string) => void;
  /** Scopes DOM ids for repeat entries, whose field keys repeat. */
  idPrefix?: string;
  /** Value of `field.dependsOn` (the department for a city). */
  dependsValue?: string;
  /** Answers the field is checked against (date bounds from `after`, warnings). */
  context?: Answers;
}

const YES_NO = [{ value: 'yes', label: 'Sí' }, { value: 'no', label: 'No' }];
const INPUTS = {
  text: { type: 'text' },
  tel: { type: 'tel', inputMode: 'tel' as const, autoComplete: 'tel' },
  email: { type: 'email', inputMode: 'email' as const, autoComplete: 'email' },
  number: { type: 'text', inputMode: 'decimal' as const },
};

/** Dispatches a field definition to its control inside the shared label/hint/error layout. */
export function FieldInput({ field, value, error, onChange, idPrefix = '', dependsValue, context = {} }: Props) {
  const [today] = useState(() => new Date());
  const id = `f-${idPrefix}${field.key}`;
  const ids = idsFor(id);
  const warnings = field.type === 'date' ? fieldWarnings(field, value, context, today) : [];
  const describedBy = [field.hint && ids.hint, warnings.length > 0 && ids.warn, error && ids.err].filter(Boolean).join(' ') || undefined;
  const a11y: ControlA11y = { id, labelId: ids.label, describedBy, invalid: !!error };
  const label = <>{field.label}{!field.required && <span className="muted"> (opcional)</span>}</>;
  const meta = { 'data-field': field.key, 'data-type': field.type };
  const shell = (group: boolean, control: React.ReactNode) => (
    <FieldShell a11y={a11y} label={label} hint={field.hint} error={error} warnings={warnings} group={group}>{control}</FieldShell>
  );

  switch (field.type) {
    case 'yesno':
      return shell(true, <SegmentedField fieldKey={field.key} type="yesno" options={YES_NO} value={value} onChange={onChange} a11y={a11y} />);
    case 'select':
      return selectVariant(field) === 'segmented'
        ? shell(true, <SegmentedField fieldKey={field.key} type="select" options={field.options ?? []} value={value} onChange={onChange} a11y={a11y} />)
        : shell(false, <SelectField fieldKey={field.key} type="select" options={field.options ?? []} value={value} onChange={onChange} a11y={a11y} />);
    case 'multiselect':
      return shell(true, <ChipsField fieldKey={field.key} options={field.options ?? []} value={value} onChange={onChange} a11y={a11y} />);
    case 'date':
      return shell(true, <DateField fieldKey={field.key} value={value} bounds={dateBounds(field, context, today)} today={today} onChange={onChange} a11y={a11y} />);
    case 'co_department':
      return shell(false, <DepartmentField fieldKey={field.key} value={value} onChange={onChange} a11y={a11y} />);
    case 'co_city':
      return shell(false, <CityField fieldKey={field.key} value={value} onChange={onChange} a11y={a11y} department={dependsValue} />);
    case 'textarea':
      return shell(false, (
        <textarea id={id} className="control" value={value} placeholder={field.placeholder} aria-invalid={!!error} aria-describedby={describedBy} {...meta} onChange={(e) => onChange(e.target.value)} />
      ));
    default:
      return shell(false, (
        <input id={id} className="control" value={value} placeholder={field.placeholder} aria-invalid={!!error} aria-describedby={describedBy} {...meta} {...INPUTS[field.type]} {...(field.digits && { inputMode: 'numeric' as const })} onChange={(e) => onChange(e.target.value)} />
      ));
  }
}
