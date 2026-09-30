export const FILE_KINDS = ['passport', 'photo', 'national_id', 'previous_visa', 'employment_letter'] as const;
export type FileKind = (typeof FILE_KINDS)[number];
export const REQUIRED_FILE_KINDS: FileKind[] = ['passport', 'photo', 'national_id'];
export const FILE_LABELS: Record<FileKind, string> = {
  passport: 'Foto de la página de datos del pasaporte',
  photo: 'Foto tipo visa',
  national_id: 'Cédula de ciudadanía',
  previous_visa: 'Visa anterior de EE. UU. (si aplica)',
  employment_letter: 'Carta laboral (opcional)',
};
