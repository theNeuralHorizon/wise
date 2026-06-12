import { z } from 'zod';

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  qty: z.number(),
  emoji: z.string(),
});

export const PersonSchema = z.object({
  id: z.number(),
  apiId: z.string().optional(),
  name: z.string(),
  emoji: z.string(),
  color: z.string(),
  upi: z.string().nullable(),
});

export const BackendParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  upi_id: z.string().nullable(),
});

export const BackendItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  quantity: z.number(),
  emoji: z.string(),
});

export const BackendAssignmentSchema = z.object({
  item_id: z.string(),
  participant_id: z.string(),
});

export const SplitDetailResponseSchema = z.object({
  split: z.object({
    name: z.string(),
    restaurant: z.string().nullable(),
    total_amount: z.number(),
    tax: z.number(),
    tip: z.number(),
  }),
  participants: z.array(BackendParticipantSchema),
  items: z.array(BackendItemSchema),
  assignments: z.array(BackendAssignmentSchema),
});

export const GuestViewResponseSchema = z.object({
  split_id: z.string(),
  name: z.string(),
  restaurant: z.string().nullable(),
  total: z.number(),
  tax: z.number(),
  tip: z.number(),
  host: z.object({
    name: z.string(),
    emoji: z.string(),
    upi_id: z.string().nullable(),
  }),
  items: z.array(BackendItemSchema),
  ws_url: z.string().optional(),
});

export const SplitCreatedResponseSchema = z.object({
  split_id: z.string(),
  owner_token: z.string(),
  token_created_at: z.string(),
  guest_token: z.string(),
  guest_link: z.string(),
  ws_url: z.string(),
});

export const AddItemResponseSchema = z.object({
  status: z.string(),
  item_id: z.string(),
});

export const HealthResponseSchema = z.object({
  status: z.string(),
  service: z.string().optional(),
  version: z.string().optional(),
  db: z.string().optional(),
});

export const ReceiptUploadResponseSchema = z.object({
  status: z.string(),
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number(),
    unit_price: z.number(),
    quantity: z.number(),
    emoji: z.string(),
  })),
  totals: z.object({
    subtotal: z.number(),
    tax: z.number(),
    tip: z.number(),
    total: z.number(),
  }),
  restaurant: z.string().nullable(),
  confidence: z.number(),
  is_mock: z.boolean(),
});

export const SettlementTransactionSchema = z.object({
  from_id: z.string(),
  from_name: z.string(),
  from_emoji: z.string(),
  from_upi: z.string().nullable(),
  to_id: z.string(),
  to_name: z.string(),
  to_emoji: z.string(),
  to_upi: z.string().nullable(),
  amount: z.number(),
  upi_deeplink: z.string(),
});

export const MinimizeCashFlowResponseSchema = z.object({
  split_name: z.string(),
  transactions: z.array(SettlementTransactionSchema),
  total_people: z.number(),
  total_transactions: z.number(),
});

export const GuestPayResponseSchema = z.object({
  status: z.string(),
  payment_id: z.string(),
  upi_deeplink: z.string(),
  upi_id: z.string(),
  message: z.string(),
});

export const PaymentRecordSchema = z.object({
  id: z.string(),
  split_id: z.string(),
  from_participant: z.string(),
  from_name: z.string(),
  from_emoji: z.string(),
  to_participant: z.string(),
  amount: z.number(),
  status: z.string(),
  created_at: z.string(),
  confirmed_at: z.string().nullable(),
});

export const PaymentsResponseSchema = z.object({
  payments: z.array(PaymentRecordSchema),
});

export type Item = z.infer<typeof ItemSchema>;
export type Person = z.infer<typeof PersonSchema>;
export type SplitDetailResponse = z.infer<typeof SplitDetailResponseSchema>;
export type GuestViewResponse = z.infer<typeof GuestViewResponseSchema>;
export type SplitCreatedResponse = z.infer<typeof SplitCreatedResponseSchema>;
export type AddItemResponse = z.infer<typeof AddItemResponseSchema>;
export type ReceiptUploadResponse = z.infer<typeof ReceiptUploadResponseSchema>;
export type SettlementTransaction = z.infer<typeof SettlementTransactionSchema>;
export type MinimizeCashFlowResponse = z.infer<typeof MinimizeCashFlowResponseSchema>;
export type GuestPayResponse = z.infer<typeof GuestPayResponseSchema>;
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

export interface SplitHistoryItem {
  id: string;
  restaurant: string;
  date: string;
  count: number;
  link: string;
  amount: number;
}

export interface FriendInput {
  name: string;
  emoji: string;
  upi: string;
}
