import { describe, expect, it } from 'vitest';
import { mapCustomerInvoiceStatusToOrderFields } from './orderInvoiceSyncService.js';

describe('mapCustomerInvoiceStatusToOrderFields', () => {
  it('paid → payment paid, processing', () => {
    expect(mapCustomerInvoiceStatusToOrderFields('paid')).toEqual({
      payment_status: 'paid',
      status: 'processing',
    });
  });

  it('pending → payment pending, pending', () => {
    expect(mapCustomerInvoiceStatusToOrderFields('pending')).toEqual({
      payment_status: 'pending',
      status: 'pending',
    });
  });

  it('cancelled → failed, cancelled', () => {
    expect(mapCustomerInvoiceStatusToOrderFields('cancelled')).toEqual({
      payment_status: 'failed',
      status: 'cancelled',
    });
  });

  it('overdue → pending operacional (ainda não pago)', () => {
    expect(mapCustomerInvoiceStatusToOrderFields('overdue')).toEqual({
      payment_status: 'pending',
      status: 'pending',
    });
  });

  it('failed/refunded → failed, cancelled', () => {
    expect(mapCustomerInvoiceStatusToOrderFields('failed')).toEqual({
      payment_status: 'failed',
      status: 'cancelled',
    });
    expect(mapCustomerInvoiceStatusToOrderFields('refunded')).toEqual({
      payment_status: 'failed',
      status: 'cancelled',
    });
  });
});
