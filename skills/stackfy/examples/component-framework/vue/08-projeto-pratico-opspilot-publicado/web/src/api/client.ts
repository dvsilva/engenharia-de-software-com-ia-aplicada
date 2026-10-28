import {
  approvalSuccessSchema,
  chatPendingSchema,
  chatSuccessSchema,
  type ApprovalSuccess,
  type ChatPending,
  type ChatSuccess,
} from './types';

export type PostChatInput = {
  baseUrl: string;
  message: string;
  userId?: string;
  conversationId?: string | null;
  awaitHumanApproval?: boolean;
  signal?: AbortSignal;
};

export type PostChatResult =
  | { kind: 'success'; status: 200; data: ChatSuccess }
  | { kind: 'pending'; status: 202; data: ChatPending };

export type PostApprovalInput = {
  baseUrl: string;
  approvalId: string;
  decision: 'approve' | 'deny';
  userId?: string;
  signal?: AbortSignal;
};

const UNREACHABLE = 'Não foi possível falar com a API';

export class ApiClientError extends Error {
  readonly status: number | null;
  readonly body: unknown;

  constructor(message: string, status: number | null = null, body?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

export const isAbort = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

export const joinBase = (baseUrl: string, path: string) =>
  `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

const postJson = async (url: string, body: object, signal?: AbortSignal) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal,
      body: JSON.stringify(body),
    });
    const json: unknown = await response.json().catch(() => null);

    return { status: response.status, json };
  } catch (error) {
    if (isAbort(error)) throw error;

    throw new ApiClientError(UNREACHABLE);
  }
};

export const postChat = async (
  input: PostChatInput
): Promise<PostChatResult> => {
  const { status, json } = await postJson(
    joinBase(input.baseUrl, '/chat'),
    {
      message: input.message,
      userId: input.userId ?? 'war-room',
      conversationId: input.conversationId ?? undefined,
      awaitHumanApproval: input.awaitHumanApproval ?? false,
    },
    input.signal
  );

  if (status === 202) {
    const parsed = chatPendingSchema.safeParse(json);
    if (!parsed.success)
      throw new ApiClientError('Resposta 202 inválida', 202, json);

    return { kind: 'pending', status: 202, data: parsed.data };
  }

  if (status !== 200)
    throw new ApiClientError(`Falha no chat (HTTP ${status})`, status, json);

  const parsed = chatSuccessSchema.safeParse(json);
  if (!parsed.success)
    throw new ApiClientError('Resposta sem answer válida', 200, json);
  if (!parsed.data.answer)
    throw new ApiClientError('Resposta sem answer', 200, json);

  return { kind: 'success', status: 200, data: parsed.data };
};

export const postApproval = async (
  input: PostApprovalInput
): Promise<ApprovalSuccess> => {
  const { status, json } = await postJson(
    joinBase(input.baseUrl, `/approvals/${input.approvalId}`),
    { decision: input.decision, userId: input.userId ?? 'war-room' },
    input.signal
  );

  if (status !== 200)
    throw new ApiClientError(
      `Falha na aprovação (HTTP ${status})`,
      status,
      json
    );

  const parsed = approvalSuccessSchema.safeParse(json);
  if (!parsed.success || !parsed.data.answer)
    throw new ApiClientError('Resposta de aprovação inválida', 200, json);

  return parsed.data;
};
