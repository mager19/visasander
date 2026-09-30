import { useCallback, useEffect, useState } from 'react';
import type { ControlA11y } from './FieldShell';
import { SearchSelect } from './SearchSelect';
import { SelectField } from './SelectField';

type ColombiaData = typeof import('@/lib/data/colombia');

// One dynamic import shared by the department and city controls; the dataset stays in an async chunk.
let pending: Promise<ColombiaData> | null = null;
const loadColombia = () => (pending ??= import('@/lib/data/colombia').catch((e) => { pending = null; throw e; }));

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: ColombiaData };

function useColombia(): [State, () => void] {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let on = true;
    setState({ status: 'loading' });
    loadColombia().then((data) => { if (on) setState({ status: 'ready', data }); }, () => { if (on) setState({ status: 'error' }); });
    return () => { on = false; };
  }, [attempt]);
  return [state, useCallback(() => setAttempt((n) => n + 1), [])];
}

function LoadError({ retry }: { retry: () => void }) {
  return (
    <p className="field-error" role="alert">
      No se pudo cargar la lista.
      <button type="button" className="link-btn" onClick={retry}>Reintentar</button>
    </p>
  );
}

interface Props { fieldKey: string; value: string; onChange: (v: string) => void; a11y: ControlA11y }

export function DepartmentField({ fieldKey, value, onChange, a11y }: Props) {
  const [state, retry] = useColombia();
  const options = state.status === 'ready' ? state.data.COLOMBIA_DEPARTMENTS.map((d) => ({ value: d, label: d })) : [];
  return (
    <>
      <SelectField
        fieldKey={fieldKey}
        type="co_department"
        options={options}
        value={value}
        onChange={onChange}
        a11y={a11y}
        disabled={state.status !== 'ready'}
        placeholder={state.status === 'loading' ? 'Cargando…' : 'Selecciona el departamento'}
      />
      {state.status === 'error' && <LoadError retry={retry} />}
    </>
  );
}

export function CityField({ fieldKey, value, onChange, a11y, department }: Props & { department?: string }) {
  const [state, retry] = useColombia();
  const cities = state.status === 'ready' && department ? state.data.citiesOf(department) : [];
  const placeholder = state.status === 'loading' ? 'Cargando…' : !department ? 'Elige primero el departamento' : 'Escribe para buscar';
  return (
    <>
      <SearchSelect
        fieldKey={fieldKey}
        type="co_city"
        options={cities}
        value={value}
        onChange={onChange}
        a11y={a11y}
        disabled={state.status !== 'ready' || !department}
        placeholder={placeholder}
      />
      {state.status === 'error' && <LoadError retry={retry} />}
    </>
  );
}
