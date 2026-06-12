import { describe, it, expect } from 'vitest';
import {
  ItemSchema,
  PersonSchema,
  PaymentRecordSchema,
  SplitDetailResponseSchema,
  GuestViewResponseSchema,
  SplitCreatedResponseSchema,
  AddItemResponseSchema,
  HealthResponseSchema,
  ReceiptUploadResponseSchema,
  SettlementTransactionSchema,
  MinimizeCashFlowResponseSchema,
  GuestPayResponseSchema,
  PaymentsResponseSchema,
  BackendParticipantSchema,
  BackendItemSchema,
  BackendAssignmentSchema,
} from './schemas';

describe('ItemSchema', () => {
  it('accepts valid item', () => {
    const item = { id: 'i1', name: 'Burger', price: 12000, qty: 2, emoji: '🍔' };
    expect(ItemSchema.parse(item)).toEqual(item);
  });

  it('rejects missing name', () => {
    expect(() => ItemSchema.parse({ id: 'i1', price: 100, qty: 1, emoji: '🍔' })).toThrow();
  });

  it('rejects missing price', () => {
    expect(() => ItemSchema.parse({ id: 'i1', name: 'Burger', qty: 1, emoji: '🍔' })).toThrow();
  });

  it('accepts zero price', () => {
    expect(ItemSchema.parse({ id: 'i1', name: 'Free item', price: 0, qty: 1, emoji: '🎁' })).toBeTruthy();
  });

  it('accepts negative price (discount)', () => {
    expect(ItemSchema.parse({ id: 'i1', name: 'Discount', price: -500, qty: 1, emoji: '💸' })).toBeTruthy();
  });

  it('rejects non-number price', () => {
    expect(() => ItemSchema.parse({ id: 'i1', name: 'Burger', price: 'twelve', qty: 1, emoji: '🍔' })).toThrow();
  });
});

describe('PersonSchema', () => {
  it('accepts valid person', () => {
    const person = { id: 0, name: 'Alice', emoji: '😎', color: '#fff', upi: 'alice@upi' };
    expect(PersonSchema.parse(person)).toEqual(person);
  });

  it('accepts person with null UPI', () => {
    expect(PersonSchema.parse({ id: 0, name: 'Bob', emoji: '🧑', color: '#000', upi: null })).toBeTruthy();
  });

  it('accepts person without apiId (optional)', () => {
    const person = { id: 0, name: 'Alice', emoji: '😎', color: '#fff', upi: null };
    const result = PersonSchema.parse(person);
    expect(result.apiId).toBeUndefined();
  });

  it('accepts person with apiId', () => {
    const person = { id: 0, apiId: 'uuid-123', name: 'Alice', emoji: '😎', color: '#fff', upi: null };
    expect(PersonSchema.parse(person).apiId).toBe('uuid-123');
  });

  it('rejects missing emoji', () => {
    expect(() => PersonSchema.parse({ id: 0, name: 'Alice', color: '#fff', upi: null })).toThrow();
  });
});

describe('BackendParticipantSchema', () => {
  it('accepts valid participant', () => {
    expect(BackendParticipantSchema.parse({ id: 'p1', name: 'Host', emoji: '😎', upi_id: 'host@upi' })).toBeTruthy();
  });

  it('accepts null upi_id', () => {
    expect(BackendParticipantSchema.parse({ id: 'p1', name: 'Host', emoji: '😎', upi_id: null })).toBeTruthy();
  });
});

describe('BackendItemSchema', () => {
  it('accepts valid item', () => {
    expect(BackendItemSchema.parse({ id: 'i1', name: 'Pizza', price: 50000, quantity: 2, emoji: '🍕' })).toBeTruthy();
  });
});

describe('BackendAssignmentSchema', () => {
  it('accepts valid assignment', () => {
    expect(BackendAssignmentSchema.parse({ item_id: 'i1', participant_id: 'p1' })).toBeTruthy();
  });
});

describe('PaymentRecordSchema', () => {
  const validPayment = {
    id: 'pay1',
    split_id: 'split1',
    from_participant: 'p1',
    from_name: 'Alice',
    from_emoji: '😎',
    to_participant: 'p2',
    amount: 50000,
    status: 'pending',
    created_at: '2025-01-01T00:00:00Z',
    confirmed_at: null,
  };

  it('accepts pending payment', () => {
    expect(PaymentRecordSchema.parse(validPayment)).toBeTruthy();
  });

  it('accepts confirmed payment', () => {
    expect(PaymentRecordSchema.parse({ ...validPayment, status: 'confirmed', confirmed_at: '2025-01-02T00:00:00Z' })).toBeTruthy();
  });

  it('rejects missing amount', () => {
    const { amount, ...noAmount } = validPayment;
    expect(() => PaymentRecordSchema.parse(noAmount)).toThrow();
  });

  it('accepts zero amount', () => {
    expect(PaymentRecordSchema.parse({ ...validPayment, amount: 0 })).toBeTruthy();
  });

  it('accepts negative amount (refund)', () => {
    expect(PaymentRecordSchema.parse({ ...validPayment, amount: -100 })).toBeTruthy();
  });

  it('rejects missing status', () => {
    const { status, ...noStatus } = validPayment;
    expect(() => PaymentRecordSchema.parse(noStatus)).toThrow();
  });
});

describe('SplitDetailResponseSchema', () => {
  it('accepts valid response', () => {
    const data = {
      split: { name: 'Test', restaurant: 'Resto', total_amount: 100000, tax: 8000, tip: 10000 },
      participants: [{ id: 'p1', name: 'Host', emoji: '😎', upi_id: null }],
      items: [{ id: 'i1', name: 'Burger', price: 50000, quantity: 1, emoji: '🍔' }],
      assignments: [{ item_id: 'i1', participant_id: 'p1' }],
    };
    expect(SplitDetailResponseSchema.parse(data)).toBeTruthy();
  });

  it('accepts null restaurant', () => {
    const data = {
      split: { name: 'Test', restaurant: null, total_amount: 100000, tax: 8000, tip: 10000 },
      participants: [],
      items: [],
      assignments: [],
    };
    expect(SplitDetailResponseSchema.parse(data)).toBeTruthy();
  });
});

describe('GuestViewResponseSchema', () => {
  it('accepts valid guest view', () => {
    const data = {
      split_id: 's1',
      name: 'Dinner',
      restaurant: 'Resto',
      total: 100000,
      tax: 8000,
      tip: 10000,
      host: { name: 'Host', emoji: '😎', upi_id: 'host@upi' },
      items: [],
    };
    expect(GuestViewResponseSchema.parse(data)).toBeTruthy();
  });

  it('accepts optional ws_url', () => {
    const data = {
      split_id: 's1',
      name: 'Dinner',
      restaurant: null,
      total: 100000,
      tax: 0,
      tip: 0,
      host: { name: 'Host', emoji: '😎', upi_id: null },
      items: [],
      ws_url: 'ws://localhost:8081/ws/s1',
    };
    expect(GuestViewResponseSchema.parse(data)).toBeTruthy();
  });
});

describe('SplitCreatedResponseSchema', () => {
  it('accepts valid response', () => {
    const data = {
      split_id: 's1',
      owner_token: 'tok123',
      token_created_at: '2025-01-01T00:00:00Z',
      guest_token: 'guest456',
      guest_link: 'http://localhost:5173/guest/guest456',
      ws_url: 'ws://localhost:8081/ws/s1',
    };
    expect(SplitCreatedResponseSchema.parse(data)).toBeTruthy();
  });
});

describe('AddItemResponseSchema', () => {
  it('accepts valid response', () => {
    expect(AddItemResponseSchema.parse({ status: 'created', item_id: 'i1' })).toBeTruthy();
  });
});

describe('HealthResponseSchema', () => {
  it('accepts minimal response', () => {
    expect(HealthResponseSchema.parse({ status: 'ok' })).toBeTruthy();
  });

  it('accepts full response', () => {
    expect(HealthResponseSchema.parse({ status: 'ok', service: 'wise', version: '0.1.0', db: 'connected' })).toBeTruthy();
  });
});

describe('ReceiptUploadResponseSchema', () => {
  it('accepts valid response', () => {
    const data = {
      status: 'parsed',
      items: [{ id: 'i1', name: 'Burger', price: 50000, unit_price: 50000, quantity: 1, emoji: '🍔' }],
      totals: { subtotal: 50000, tax: 4000, tip: 5000, total: 59000 },
      restaurant: 'Test Resto',
      confidence: 0.95,
      is_mock: false,
    };
    expect(ReceiptUploadResponseSchema.parse(data)).toBeTruthy();
  });
});

describe('SettlementTransactionSchema', () => {
  it('accepts valid transaction', () => {
    const data = {
      from_id: 'p1', from_name: 'Alice', from_emoji: '😎', from_upi: 'alice@upi',
      to_id: 'p2', to_name: 'Bob', to_emoji: '🧑', to_upi: 'bob@upi',
      amount: 25000, upi_deeplink: 'upi://pay?...',
    };
    expect(SettlementTransactionSchema.parse(data)).toBeTruthy();
  });
});

describe('MinimizeCashFlowResponseSchema', () => {
  it('accepts valid response', () => {
    const data = {
      split_name: 'Dinner',
      transactions: [],
      total_people: 3,
      total_transactions: 2,
    };
    expect(MinimizeCashFlowResponseSchema.parse(data)).toBeTruthy();
  });
});

describe('GuestPayResponseSchema', () => {
  it('accepts valid response', () => {
    const data = {
      status: 'recorded',
      payment_id: 'pay1',
      upi_deeplink: 'upi://pay?...',
      upi_id: 'host@upi',
      message: 'Payment recorded',
    };
    expect(GuestPayResponseSchema.parse(data)).toBeTruthy();
  });
});

describe('PaymentsResponseSchema', () => {
  it('accepts valid payments array', () => {
    const data = {
      payments: [
        {
          id: 'pay1', split_id: 's1', from_participant: 'p1', from_name: 'Alice', from_emoji: '😎',
          to_participant: 'p2', amount: 50000, status: 'pending', created_at: '2025-01-01T00:00:00Z', confirmed_at: null,
        },
      ],
    };
    expect(PaymentsResponseSchema.parse(data)).toBeTruthy();
  });

  it('accepts empty payments', () => {
    expect(PaymentsResponseSchema.parse({ payments: [] })).toBeTruthy();
  });
});
