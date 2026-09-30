export const MANAGER_PATH = process.env.NEXT_PUBLIC_MANAGER_PATH || 'gestor';
export const mp = (path = ''): string => `/${MANAGER_PATH}${path}`;
