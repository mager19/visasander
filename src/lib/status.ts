import type { Status } from './repo/applications';

export const STATUS_LABEL: Record<Status, string> = {
  created: 'Creada',
  in_progress: 'En progreso',
  submitted: 'Enviada',
  reviewed: 'Revisada',
};
