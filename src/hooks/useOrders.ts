import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Order, PaymentStatusFilter } from '@/types/order';
import { toast } from 'sonner';

export interface OrdersFilters {
  currentMonth: string;
  searchQuery?: string;
  paymentFilter?: PaymentStatusFilter;
  typeFilter?: string;
}

export function useOrders(filters: OrdersFilters, page: number = 0, pageSize: number = 50) {
  return useQuery({
    queryKey: ['orders', filters, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' });

      // Apply Month Filter (Required)
      query = query.eq('current_month', filters.currentMonth);

      // Apply Remote Search
      if (filters.searchQuery) {
        query = query.or(`name.ilike.%${filters.searchQuery}%,receipt_no.ilike.%${filters.searchQuery}%,number.ilike.%${filters.searchQuery}%`);
      }

      // Apply Payment Filter
      if (filters.paymentFilter === 'verified') {
        query = query.eq('payment_verified', true);
      } else if (filters.paymentFilter === 'unverified') {
        query = query.or('payment_verified.eq.false,payment_verified.is.null');
      }

      // Apply Type Filter
      if (filters.typeFilter && filters.typeFilter !== 'all') {
        query = query.eq('type', filters.typeFilter);
      }

      // Sorting & Pagination
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      return {
        data: data as Order[],
        count: count || 0
      };
    },
  });
}

export function useOrderStats(currentMonth: string) {
  return useQuery({
    queryKey: ['order-stats', currentMonth],
    queryFn: async () => {
      // Fetch only needed columns for ALL rows in that month to calculate accurate totals
      const { data, error } = await supabase
        .from('orders')
        .select('value, payment_verified, invoice_url')
        .eq('current_month', currentMonth);

      if (error) throw error;

      const totalRevenue = data.reduce((sum, o) => sum + Number(o.value), 0);
      const paidOrders = data.filter((o) => o.payment_verified).length;
      const invoicedOrders = data.filter((o) => !!o.invoice_url).length;

      return {
        totalOrders: data.length,
        totalRevenue,
        paidOrders,
        invoicedOrders
      };
    },
  });
}

export function useToggleOrderFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderId,
      field,
      value,
      order // Optional: pass full order to avoid extra fetch for webhook
    }: {
      orderId: string;
      field: 'payment_verified' | 'order_completed';
      value: boolean;
      order?: Order;
    }) => {
      // Check if locked
      const { data: existing } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (existing?.payment_verified && existing?.order_completed && !value) {
        throw new Error('Cannot unlock a completed and verified record');
      }

      const { error } = await supabase
        .from('orders')
        .update({ [field]: value })
        .eq('id', orderId);

      if (error) throw error;

      // Trigger Webhook directly from frontend when Order is marked "Done"
      // Trigger Webhook directly from frontend when Payment is Verified
      if (field === 'payment_verified' && value === true) {
        const fullOrder = order || existing;
        if (fullOrder) {
          const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const monthLabel = new Date(fullOrder.current_month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          // Parse address components
          const rawAddress = fullOrder.customer_address || '';
          const parts = rawAddress.split(',').map(p => p.trim());
          let pincode = '';
          let state = '';

          // Find pincode (format: "Pin - XXXXXX")
          const pinIndex = parts.findIndex(p => p.startsWith('Pin - '));

          if (pinIndex !== -1) {
            pincode = parts[pinIndex].replace('Pin - ', '');
            // Assume state is immediately before pincode
            if (pinIndex > 0) {
              state = parts[pinIndex - 1];
            }
          }

          // Remaining parts form address_line1
          const line1Parts = parts.filter((_, i) => i !== pinIndex && (pinIndex === -1 || i !== pinIndex - 1));
          const addressLine1 = line1Parts.join(', ');

          // Requested format: District, State, Pincode in address_line2
          const addressLine2 = [fullOrder.district, state, pincode].filter(Boolean).join(', ');

          const payload = {
            order_completed: fullOrder.order_completed || false,
            payment_verified: true,
            id: orderId,
            receipt_no: fullOrder.receipt_no,
            date: date,
            customer_name: fullOrder.name,
            contact_number: `91${fullOrder.number}`,
            secondary_number: fullOrder.secondary_number || '',
            // customer_address removed as per request
            address_line1: addressLine1,
            address_line2: addressLine2,
            scheme_name: fullOrder.scheme,
            scheme_details: fullOrder.type,
            value: fullOrder.value,
            amount_paid: String(fullOrder.value),
            district: fullOrder.district || '',
            month_label: monthLabel,
            current_month: fullOrder.current_month,
            payment_mode: fullOrder.payment_mode || 'Gpay',
            invoice_url: fullOrder.invoice_url || '',
            created_at: fullOrder.created_at,
            updated_at: fullOrder.updated_at,
          };

          const savedWebhook = localStorage.getItem('n8n_payment_webhook_url');
          const webhookUrl = savedWebhook || 'https://n8n.srv930949.hstgr.cloud/webhook-test/payment-webhook';

          console.log(`[Webhook] Triggering for ${field}...`, { url: webhookUrl, payload });

          // Trigger Webhook Directly from Frontend
          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
            .then(async res => {
              const text = await res.text();
              console.log(`[Webhook] Response (${res.status}):`, text);
            })
            .catch(err => console.error('[Webhook] Trigger failed:', err));
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Record updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update record');
      console.error(error);
    },
  });
}

export function useUpsertOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (order: Partial<Order>) => {
      if (order.id) {
        // Check if locked before update
        const { data: existing } = await supabase
          .from('orders')
          .select('payment_verified, order_completed')
          .eq('id', order.id)
          .single();

        if (existing?.payment_verified && existing?.order_completed) {
          throw new Error('Cannot edit a locked record');
        }

        const { error } = await supabase
          .from('orders')
          .update(order)
          .eq('id', order.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('orders')
          .insert([order as any]);
        if (error) throw error;
      }

    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order saved successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to save order');
      console.error(error);
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      // Check if locked before deletion
      const { data: existing } = await supabase
        .from('orders')
        .select('payment_verified, order_completed')
        .eq('id', orderId)
        .single();

      if (existing?.payment_verified && existing?.order_completed) {
        throw new Error('Cannot delete a locked record');
      }

      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Record deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete record');
      console.error(error);
    },
  });
}

export function useDeleteAllOrders() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('All records deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete all records');
      console.error(error);
    },
  });
}



