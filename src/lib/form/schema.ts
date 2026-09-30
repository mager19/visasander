import type { Chapter, Condition, Field, Option } from './types';

const f = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, type: 'text', required: true, ...o });
const yesNo = (key: string, label: string): Field => f(key, label, { type: 'yesno' });
const opts = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
const when = (key: string, ...values: string[]): Condition => ({ key, in: values });
const YES = (key: string) => when(key, 'yes');

export const CHAPTERS: Chapter[] = [
  {
    id: 'personal',
    title: 'Información personal',
    screens: [
      { id: 'names', title: 'Tu nombre', fields: [f('apellidos', 'Apellidos (como en el pasaporte)'), f('nombres', 'Nombres (como en el pasaporte)')] },
      {
        id: 'sex_marital', title: 'Sexo y estado civil',
        fields: [
          f('sexo', 'Sexo', { type: 'select', options: opts(['F', 'Femenino'], ['M', 'Masculino']) }),
          f('estado_civil', 'Estado civil', { type: 'select', options: opts(['soltero', 'Soltero/a'], ['casado', 'Casado/a'], ['union_libre', 'Unión libre'], ['divorciado', 'Divorciado/a'], ['viudo', 'Viudo/a'], ['separado', 'Separado/a']) }),
        ],
      },
      { id: 'birth_date', title: 'Fecha de nacimiento', fields: [f('fecha_nacimiento', 'Fecha de nacimiento', { type: 'date', range: { yearsBack: 120, yearsForward: 0 } })] },
      { id: 'birth_place', title: 'Lugar de nacimiento', fields: [
          f('pais_nacimiento', 'País de nacimiento', { type: 'select', options: opts(['Colombia', 'Colombia'], ['otro', 'Otro país']), default: 'Colombia' }),
          f('departamento_nacimiento', 'Departamento', { type: 'co_department', showIf: when('pais_nacimiento', 'Colombia') }),
          f('ciudad_nacimiento', 'Ciudad o municipio', { type: 'co_city', dependsOn: 'departamento_nacimiento', showIf: when('pais_nacimiento', 'Colombia') }),
          f('pais_nacimiento_otro', 'País', { showIf: when('pais_nacimiento', 'otro') }),
          f('departamento_nacimiento_otro', 'Estado o provincia', { required: false, showIf: when('pais_nacimiento', 'otro') }),
          f('ciudad_nacimiento_otro', 'Ciudad', { showIf: when('pais_nacimiento', 'otro') }),
        ],
      },
      {
        id: 'nationality', title: 'Nacionalidad',
        fields: [
          f('nacionalidad', 'Nacionalidad'),
          yesNo('otras_nacionalidades', '¿Tienes otras nacionalidades o residencias permanentes en otros países?'),
          f('otras_nacionalidades_detalle', 'Indica cuáles', { type: 'textarea', showIf: YES('otras_nacionalidades') }),
        ],
      },
      { id: 'national_id', title: 'Documento de identidad', fields: [f('cedula', 'Número de cédula o identificación nacional', { digits: { min: 5, max: 12 } })] },
      { id: 'address', title: 'Domicilio', fields: [f('direccion', 'Dirección de domicilio actual', { type: 'textarea' })] },
      {
        id: 'contact', title: 'Datos de contacto',
        fields: [
          f('telefono_principal', 'Teléfono principal', { type: 'tel' }),
          f('telefono_alterno', 'Teléfono alternativo', { type: 'tel', required: false }),
          f('correo', 'Correo electrónico', { type: 'email' }),
        ],
      },
      {
        id: 'social', title: 'Redes sociales (últimos 5 años)',
        repeat: { key: 'redes_sociales', addLabel: 'Agregar otra red' },
        fields: [f('plataforma', 'Plataforma (Instagram, Facebook, etc.)'), f('usuario', 'Nombre de usuario')],
      },
    ],
  },
  {
    id: 'passport',
    title: 'Pasaporte',
    screens: [
      {
        id: 'passport_type', title: 'Pasaporte',
        fields: [
          f('pasaporte_tipo', 'Tipo de pasaporte', { type: 'select', options: opts(['ordinario', 'Ordinario'], ['oficial', 'Oficial'], ['diplomatico', 'Diplomático']) }),
          f('pasaporte_numero', 'Número de pasaporte'),
        ],
      },
      { id: 'passport_issuer', title: 'Emisión', fields: [f('pasaporte_pais_emision', 'País de emisión'), f('pasaporte_autoridad', 'Autoridad que lo emitió')] },
      {
        id: 'passport_dates', title: 'Fechas del pasaporte',
        fields: [
          f('pasaporte_expedicion', 'Fecha de expedición', { type: 'date', range: { yearsBack: 20, yearsForward: 0 } }),
          f('pasaporte_caducidad', 'Fecha de caducidad', { type: 'date', after: 'pasaporte_expedicion', afterMessage: 'Debe ser posterior a la fecha de expedición', range: { yearsForward: 20 } }),
        ],
      },
      {
        id: 'passport_lost', title: 'Pasaporte perdido',
        fields: [
          yesNo('pasaporte_perdido', '¿Has perdido o te han robado algún pasaporte?'),
          f('pasaporte_perdido_detalle', 'Detalles de la pérdida o robo', { type: 'textarea', showIf: YES('pasaporte_perdido') }),
        ],
      },
    ],
  },
  {
    id: 'travel',
    title: 'Viaje',
    screens: [
      { id: 'purpose', title: 'Propósito del viaje', fields: [f('viaje_proposito', 'Propósito principal del viaje a EE. UU.', { type: 'textarea' })] },
      {
        id: 'itinerary', title: 'Itinerario',
        fields: [
          yesNo('viaje_itinerario', '¿Tienes un itinerario de viaje específico?'),
          f('viaje_fechas', 'Fechas estimadas del viaje', { showIf: YES('viaje_itinerario') }),
          f('viaje_vuelo', 'Vuelo (si ya lo tienes)', { required: false, showIf: YES('viaje_itinerario') }),
          f('viaje_alojamiento', 'Hotel o dirección de estancia', { showIf: YES('viaje_itinerario') }),
        ],
      },
      {
        id: 'payer', title: 'Quién paga el viaje',
        fields: [
          f('viaje_paga', '¿Quién paga el viaje?', { type: 'select', options: opts(['yo', 'Yo mismo/a'], ['familiar', 'Un familiar'], ['otra_persona', 'Otra persona'], ['empresa', 'Una empresa']) }),
          f('viaje_paga_detalle', 'Nombre de quien paga', { showIf: { key: 'viaje_paga', notIn: ['yo'] } }),
        ],
      },
    ],
  },
  {
    id: 'history',
    title: 'Acompañantes e historial en EE. UU.',
    screens: [
      { id: 'companions_q', title: 'Acompañantes', fields: [yesNo('acompanantes_si', '¿Viajas con otras personas?')] },
      {
        id: 'companions', title: 'Datos de los acompañantes', showIf: YES('acompanantes_si'),
        repeat: { key: 'acompanantes', addLabel: 'Agregar otro acompañante' },
        fields: [f('nombre', 'Nombre completo'), f('parentesco', 'Parentesco o relación')],
      },
      { id: 'prev_trips_q', title: 'Viajes anteriores', fields: [yesNo('estuvo_eeuu', '¿Has estado antes en EE. UU.?')] },
      {
        id: 'prev_trips', title: 'Viajes anteriores a EE. UU.', showIf: YES('estuvo_eeuu'),
        repeat: { key: 'viajes_previos', addLabel: 'Agregar otro viaje' },
        fields: [f('fecha', 'Fecha aproximada de llegada'), f('duracion', 'Duración de la estadía')],
      },
      {
        id: 'prev_visa', title: 'Visa anterior',
        fields: [
          yesNo('visa_previa', '¿Has tenido alguna vez una visa de EE. UU.?'),
          f('visa_previa_numero', 'Número de la visa anterior', { required: false, showIf: YES('visa_previa') }),
          f('visa_previa_fecha', 'Fecha de expedición de la visa', { type: 'date', range: { yearsForward: 0 }, showIf: YES('visa_previa') }),
          f('visa_previa_perdida', '¿Se perdió, fue robada o revocada?', { type: 'yesno', showIf: YES('visa_previa') }),
        ],
      },
      {
        id: 'denied', title: 'Negativas',
        fields: [
          yesNo('visa_negada', '¿Te han negado una visa, negado la entrada a EE. UU. o retirado tu solicitud en un puerto de entrada?'),
          f('visa_negada_detalle', 'Cuéntanos qué pasó', { type: 'textarea', showIf: YES('visa_negada') }),
        ],
      },
    ],
  },
  {
    id: 'us_contact',
    title: 'Contacto en EE. UU.',
    screens: [
      { id: 'us_contact_who', title: 'Persona de contacto', fields: [f('contacto_nombre', 'Persona, hotel u organización de contacto'), f('contacto_direccion', 'Dirección completa en EE. UU.', { type: 'textarea' })] },
      { id: 'us_contact_how', title: 'Cómo contactarlo', fields: [f('contacto_telefono', 'Teléfono de contacto', { type: 'tel' }), f('contacto_correo', 'Correo de contacto', { type: 'email', required: false })] },
    ],
  },
  {
    id: 'family',
    title: 'Familia',
    screens: [
      { id: 'father', title: 'Tu padre', fields: [f('padre_nombres', 'Nombres completos'), f('padre_nacimiento', 'Fecha de nacimiento', { type: 'date', range: { yearsBack: 120, yearsForward: 0 } }), f('padre_ubicacion', 'Ubicación actual')] },
      { id: 'mother', title: 'Tu madre', fields: [f('madre_nombres', 'Nombres completos'), f('madre_nacimiento', 'Fecha de nacimiento', { type: 'date', range: { yearsBack: 120, yearsForward: 0 } }), f('madre_ubicacion', 'Ubicación actual')] },
      {
        id: 'family_us', title: 'Familiares directos en EE. UU.',
        fields: [
          yesNo('familiares_eeuu', '¿Tienes familiares directos (padres, hermanos, hijos o cónyuge) viviendo en EE. UU.?'),
          f('familiares_eeuu_detalle', 'Nombres y parentesco', { type: 'textarea', showIf: YES('familiares_eeuu') }),
        ],
      },
      {
        id: 'other_family_us', title: 'Otros familiares en EE. UU.',
        fields: [
          yesNo('otros_familiares_eeuu', '¿Tienes otros familiares en EE. UU. aparte de los mencionados?'),
          f('otros_familiares_eeuu_detalle', 'Nombres y parentesco', { type: 'textarea', showIf: YES('otros_familiares_eeuu') }),
        ],
      },
    ],
  },
  {
    id: 'work',
    title: 'Trabajo y estudios',
    screens: [
      {
        id: 'occupation', title: 'Ocupación',
        fields: [f('ocupacion', 'Ocupación actual principal', { type: 'select', options: opts(['empleado', 'Empleado/a'], ['independiente', 'Independiente'], ['estudiante', 'Estudiante'], ['desempleado', 'Desempleado/a'], ['jubilado', 'Jubilado/a']) })],
      },
      {
        id: 'employer', title: 'Empresa o institución actual', showIf: when('ocupacion', 'empleado', 'independiente', 'estudiante'),
        fields: [f('empresa_nombre', 'Nombre de la empresa o institución'), f('empresa_direccion', 'Dirección'), f('empresa_telefono', 'Teléfono', { type: 'tel' })],
      },
      {
        id: 'job_details', title: 'Detalles del trabajo', showIf: when('ocupacion', 'empleado', 'independiente', 'estudiante'),
        fields: [
          f('empresa_inicio', 'Fecha de inicio', { type: 'date', range: { yearsBack: 60, yearsForward: 0 } }),
          f('salario_mensual', 'Salario mensual (moneda local)', { type: 'number', showIf: when('ocupacion', 'empleado', 'independiente') }),
          f('empresa_funciones', 'Descripción breve de tus funciones', { type: 'textarea' }),
        ],
      },
      {
        id: 'prev_jobs', title: 'Empleos anteriores (últimos 5 años)',
        repeat: { key: 'empleos_previos', addLabel: 'Agregar otro empleo' },
        fields: [
          f('empresa', 'Empresa'), f('direccion', 'Dirección', { required: false }), f('telefono', 'Teléfono', { type: 'tel', required: false }),
          f('inicio', 'Fecha de inicio', { type: 'date', range: { yearsBack: 60, yearsForward: 0 } }), f('fin', 'Fecha de fin', { type: 'date', after: 'inicio' }),
          f('funciones', 'Funciones', { type: 'textarea', required: false }),
        ],
      },
      {
        id: 'education', title: 'Estudios',
        repeat: { key: 'educacion', addLabel: 'Agregar otra institución' },
        fields: [
          f('institucion', 'Nombre de la institución'), f('direccion', 'Dirección', { required: false }),
          f('nivel', 'Nivel', { type: 'select', options: opts(['secundaria', 'Secundaria'], ['universidad', 'Universidad'], ['posgrado', 'Posgrado'], ['otro', 'Otro']) }),
          f('desde', 'Desde', { type: 'date', range: { yearsBack: 60, yearsForward: 0 } }), f('hasta', 'Hasta', { type: 'date', after: 'desde' }),
        ],
      },
      {
        id: 'languages', title: 'Idiomas',
        fields: [
          f('idiomas', 'Idiomas que hablas', { type: 'multiselect', options: opts(['es', 'Español'], ['en', 'Inglés'], ['fr', 'Francés'], ['pt', 'Portugués'], ['it', 'Italiano'], ['de', 'Alemán'], ['zh', 'Chino'], ['otro', 'Otro']) }),
          f('idiomas_otro', '¿Cuál otro idioma?', { showIf: { key: 'idiomas', includes: 'otro' } }),
        ],
      },
      { id: 'visited', title: 'Países visitados', fields: [f('paises_visitados', 'Países visitados en los últimos 5 años', { type: 'textarea' })] },
      { id: 'orgs', title: 'Organizaciones', fields: [f('organizaciones', 'Organizaciones profesionales o caritativas a las que perteneces', { type: 'textarea', required: false })] },
    ],
  },
];
