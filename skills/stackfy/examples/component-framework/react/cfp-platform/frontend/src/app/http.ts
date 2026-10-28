export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    super(`HTTP ${status}`);
  }
}

const readBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const requestJson = async <Result>(
  path: string,
  init?: RequestInit
): Promise<Result> => {
  const response = await fetch(path, init);
  const body = await readBody(response);

  if (!response.ok) throw new HttpError(response.status, body);

  return body as Result;
};

export const postJson = <Result>(path: string, payload: unknown) =>
  requestJson<Result>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

export const errorMessageOf = (error: unknown) => {
  if (!(error instanceof HttpError)) return null;

  const { body } = error;

  if (typeof body !== 'object' || body === null || !('message' in body))
    return null;

  return body.message ? String(body.message) : null;
};
