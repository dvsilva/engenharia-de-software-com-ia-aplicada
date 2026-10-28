import { z } from 'zod';

export const traceEventSchema = z.object({
  type: z.enum([
    'thought',
    'action',
    'observation',
    'plan',
    'critique',
    'answer',
    'summarize',
    'route',
    'fallback',
  ]),
  content: z.string(),
  node: z.string(),
  tool: z.string().optional(),
  toolArgs: z.record(z.unknown()).optional(),
  round: z.number().optional(),
  approved: z.boolean().optional(),
  timestampMs: z.number().optional(),
  route: z.string().optional(),
  override: z.boolean().optional(),
  reason: z.string().optional(),
});

export const approvalSuccessSchema = z.object({
  requestId: z.string().min(1),
  answer: z.string(),
  trace: z.array(traceEventSchema),
  metrics: z.record(z.unknown()).optional(),
  conversationId: z.string().uuid().nullable(),
});

export const chatSuccessSchema = approvalSuccessSchema.extend({
  conversationId: z.string().uuid(),
});

export const chatPendingSchema = z.object({
  requestId: z.string().min(1),
  conversationId: z.string().uuid().nullable(),
  pending: z.object({
    approvalId: z.string().uuid(),
    summary: z.string().min(1),
    createdAt: z.number(),
  }),
});

export type TraceEventView = z.infer<typeof traceEventSchema>;

export type ChatSuccess = z.infer<typeof chatSuccessSchema>;

export type ChatPending = z.infer<typeof chatPendingSchema>;

export type ApprovalSuccess = z.infer<typeof approvalSuccessSchema>;
