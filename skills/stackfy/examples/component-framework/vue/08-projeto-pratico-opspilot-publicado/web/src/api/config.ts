export const API_BASE_STORAGE_KEY = 'opspilot.warRoom.apiBaseUrl';
export const DEFAULT_API_BASE_URL = 'http://localhost:3000';

export const normalizeBaseUrl = (raw: string) => raw.trim().replace(/\/+$/, '');

export const isValidApiBaseUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  try {
    const { protocol } = new URL(trimmed);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export const loadApiBaseUrl = (
  storage: Pick<Storage, 'getItem'> = localStorage
) => {
  const stored = storage.getItem(API_BASE_STORAGE_KEY);
  if (!stored || !isValidApiBaseUrl(stored)) return DEFAULT_API_BASE_URL;

  return normalizeBaseUrl(stored);
};

export const saveApiBaseUrl = (
  raw: string,
  storage: Pick<Storage, 'setItem'> = localStorage
) => {
  if (!isValidApiBaseUrl(raw)) throw new Error('URL inválida');

  const normalized = normalizeBaseUrl(raw);

  storage.setItem(API_BASE_STORAGE_KEY, normalized);
  return normalized;
};
