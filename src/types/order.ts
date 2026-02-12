export interface Product {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  receipt_no: string; // unique
  scheme: string;
  value: number;
  name: string;
  number: string;
  secondary_number: string | null;
  type: string;
  district: string;
  current_month: string; // YYYY-MM
  customer_address: string | null;
  payment_mode: string | null;
  payment_verified: boolean;
  order_completed: boolean;
  invoice_url: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentStatusFilter = 'all' | 'verified' | 'unverified';
export type OrderStatusFilter = 'all' | 'completed' | 'pending';
export type InvoiceFilter = 'all' | 'invoiced' | 'not_invoiced';
