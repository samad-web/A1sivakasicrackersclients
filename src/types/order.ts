export interface Product {
  name: string;
  quantity: number;
  price: number;
}

export type PaymentStatus = 'Pending' | 'Completed' | 'Empty' | 'Partial';

export interface MonthlyPayment {
  id: string;
  order_id: string;
  month_name: string;
  payment_status: PaymentStatus;
  payment_date: string | null;
  payment_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  current_month: string | null;
  customer_address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  pincode: string | null;
  state: string | null;
  payment_mode: string | null;
  order_completed: boolean;
  invoice_url: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  monthly_payments?: MonthlyPayment[];
}

export type PaymentStatusFilter = 'all' | 'verified' | 'unverified';
export type OrderStatusFilter = 'all' | 'completed' | 'pending';
export type InvoiceFilter = 'all' | 'invoiced' | 'not_invoiced';
