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
        query = query.eq('payment_verified', false);
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
        .select('payment_verified, order_completed, name, number, receipt_no, value, scheme, current_month, customer_address, payment_mode, type')
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

      // Trigger Webhook via edge function if payment verified
      if (field === 'payment_verified' && value === true) {
        const fullOrder = order || existing;
        if (fullOrder) {
          const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const monthLabel = new Date(fullOrder.current_month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          const addrLines = (fullOrder.customer_address || '').split('\n').filter(Boolean);

          const payload = {
            payment_completed: true,
            receipt_no: fullOrder.receipt_no,
            date: date,
            customer_name: fullOrder.name,
            contact_number: `91${fullOrder.number}`,
            address_line1: addrLines[0] || '',
            address_line2: addrLines.slice(1).join(', ') || '',
            scheme_details: fullOrder.type,
            scheme_name: fullOrder.scheme,
            month_label: monthLabel,
            current_month: fullOrder.current_month,
            amount_paid: String(fullOrder.value),
            payment_mode: fullOrder.payment_mode || 'Gpay'
          };

          // Route through edge function to avoid CORS
          supabase.functions.invoke('invoice-proxy', {
            body: payload,
          }).catch(err => console.error('Webhook trigger failed:', err));
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

      // Trigger webhook immediately via edge function (no CORS issues)
      const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const currentMonth = order.current_month || new Date().toISOString().slice(0, 7);
      const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const addrLines = (order.customer_address || '').split('\n').filter(Boolean);

      const payload = {
        record_updated: true,
        receipt_no: order.receipt_no || '',
        date: date,
        customer_name: order.name || '',
        contact_number: `91${order.number || ''}`,
        address_line1: addrLines[0] || '',
        address_line2: addrLines.slice(1).join(', ') || '',
        scheme_details: order.type || '',
        scheme_name: order.scheme || '',
        month_label: monthLabel,
        current_month: currentMonth,
        amount_paid: String(order.value || 0),
        payment_mode: order.payment_mode || 'Gpay',
      };

      // Route through edge function to avoid CORS
      try {
        await supabase.functions.invoke('invoice-proxy', {
          body: payload,
        });
      } catch (err) {
        console.error('Webhook trigger failed:', err);
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



