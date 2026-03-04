import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Order, PaymentStatusFilter } from '@/types/order';
import { toast } from 'sonner';

export interface OrdersFilters {
  monthName: string; // e.g. 'January'
  cycleYear: number; // e.g. 2025
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
        .select('*, monthly_payments!inner(*)', { count: 'exact' });

      // Apply Month and Cycle Filter from monthly_payments table
      query = query
        .eq('monthly_payments.month_name', filters.monthName);

      // Filter by creation date range to match the cycle year
      // A cycle starts in November of cycleYear and ends in September of cycleYear + 1
      const startDate = new Date(filters.cycleYear, 10, 1).toISOString(); // Nov 1
      const endDate = new Date(filters.cycleYear + 1, 9, 1).toISOString(); // Oct 1 (exclusive)
      query = query.gte('created_at', startDate).lt('created_at', endDate);

      // Apply Remote Search
      if (filters.searchQuery) {
        query = query.or(`name.ilike.%${filters.searchQuery}%,receipt_no.ilike.%${filters.searchQuery}%,number.ilike.%${filters.searchQuery}%`);
      }

      // Apply Payment Filter
      if (filters.paymentFilter === 'verified') {
        query = query.eq('monthly_payments.payment_status', 'Completed');
      } else if (filters.paymentFilter === 'unverified') {
        query = query.neq('monthly_payments.payment_status', 'Completed');
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
        data: (data as unknown) as Order[],
        count: count || 0
      };
    },
  });
}

export function useOrderStats(monthName: string, cycleYear: number) {
  return useQuery({
    queryKey: ['order-stats', monthName, cycleYear],
    queryFn: async () => {
      const query = supabase
        .from('monthly_payments')
        .select('payment_status, orders!inner(value, invoice_url, created_at)')
        .eq('month_name', monthName);

      // Filter statistics by the cycle year's creation date range
      const startDate = new Date(cycleYear, 10, 1).toISOString();
      const endDate = new Date(cycleYear + 1, 9, 1).toISOString();

      const { data, error } = await query
        .gte('orders.created_at', startDate)
        .lt('orders.created_at', endDate);

      if (error) throw error;

      const totalRevenue = data?.reduce((sum, item) => {
        const order = item.orders as unknown as { value: number } | null;
        return sum + Number(order?.value || 0);
      }, 0) || 0;
      const paidOrders = data?.filter((item) => item.payment_status === 'Completed').length || 0;
      const invoicedOrders = data?.filter((item) => {
        const order = item.orders as unknown as { invoice_url: string | null } | null;
        return !!order?.invoice_url;
      }).length || 0;

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
      order,
      monthName
    }: {
      orderId: string;
      field: 'payment_verified' | 'order_completed';
      value: boolean;
      order?: Order;
      monthName?: string;
    }) => {
      if (field === 'payment_verified') {
        if (!monthName) throw new Error('Month name is required to toggle payment status');

        const { error } = await supabase
          .from('monthly_payments')
          .update({
            payment_status: value ? 'Completed' : 'Pending',
            payment_date: value ? new Date().toISOString() : null
          })
          .eq('order_id', orderId)
          .eq('month_name', monthName);

        if (error) throw error;

        // Trigger Webhook if verified
        if (value === true && order) {
          const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          const monthLabel = `${monthName} 2026`; // Simplified for now

          // Parse address components
          const rawAddress = order.customer_address || '';
          const parts = rawAddress.split(',').map(p => p.trim());
          let pincode = '';
          let state = '';

          const pinIndex = parts.findIndex(p => p.startsWith('Pin - '));
          if (pinIndex !== -1) {
            pincode = parts[pinIndex].replace('Pin - ', '');
            if (pinIndex > 0) state = parts[pinIndex - 1];
          }

          const line1Parts = parts.filter((_, i) => i !== pinIndex && (pinIndex === -1 || i !== pinIndex - 1));
          const addressLine1 = line1Parts.join(', ');
          const addressLine2 = [order.district, state, pincode].filter(Boolean).join(', ');

          const payload = {
            order_completed: order.order_completed || false,
            payment_verified: true,
            id: orderId,
            receipt_no: order.receipt_no,
            date: date,
            customer_name: order.name,
            contact_number: `91${order.number}`,
            secondary_number: order.secondary_number || '',
            address_line1: addressLine1,
            address_line2: addressLine2,
            scheme_name: order.scheme,
            scheme_details: order.type,
            value: order.value,
            amount_paid: String(order.value),
            district: order.district || '',
            month_label: monthLabel,
            month_name: monthName,
            payment_mode: order.payment_mode || 'Gpay',
            invoice_url: order.invoice_url || '',
            created_at: order.created_at,
            updated_at: order.updated_at,
          };

          const webhookUrl = 'https://n8n.srv930949.hstgr.cloud/webhook/payment-webhook';

          fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }).catch(err => console.error('[Webhook] Trigger failed:', err));
        }
      } else {
        const { error } = await supabase
          .from('orders')
          .update({ [field]: value })
          .eq('id', orderId);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['order-stats'] });
      toast.success('Record updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update record');
      console.error(error);
    },
  });
}

export function useUpsertOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (order: Partial<Order>) => {
      // Remove legacy and UI-only fields if present
      const { monthly_payments: _, ...tempOrder } = order as Record<string, unknown>;

      // List of fields that are definitely NOT in the database
      const uiOnlyFields = [
        'payment_verified',
      ];

      const cleanOrder: Record<string, any> = {};
      Object.keys(tempOrder).forEach(key => {
        if (!uiOnlyFields.includes(key) && tempOrder[key] !== undefined) {
          cleanOrder[key] = tempOrder[key];
        }
      });

      if (order.id) {
        const { error } = await supabase
          .from('orders')
          .update(cleanOrder as any)
          .eq('id', order.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('orders')
          .insert([cleanOrder as any]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast.success('Order saved successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save order');
      console.error(error);
    },
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      // Check if locked before deletion (if any month is Completed)
      const { data, error: fetchError } = await supabase
        .from('monthly_payments')
        .select('payment_status')
        .eq('order_id', orderId);

      if (fetchError) throw fetchError;

      const isLocked = (data as { payment_status: string }[])?.some(p => p.payment_status === 'Completed');

      if (isLocked) {
        throw new Error('Cannot delete a record with completed payments');
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete all records');
      console.error(error);
    },
  });
}



