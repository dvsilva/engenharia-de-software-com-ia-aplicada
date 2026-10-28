import type { TraceEventView } from '../api/types';

export type ChatTurnView = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  requestId?: string;
  trace?: TraceEventView[];
  errorMessage?: string;
};

export type DecisionStatus = 'pending' | 'approved' | 'denied' | 'error';

export type PendingApproval = {
  approvalId: string;
  summary: string;
  status: DecisionStatus;
  errorMessage: string | null;
};
