type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted';

export function getPaymentStatusVariant(status: string): BadgeVariant {
    switch (status.toLowerCase()) {
        case 'paid':
        case 'completed':
            return 'success';
        case 'partial':
            return 'warning';
        case 'unpaid':
        case 'pending':
            return 'danger';
        default:
            return 'muted';
    }
}

export function getOrderStatusVariant(status: string): BadgeVariant {
    switch (status.toLowerCase()) {
        case 'completed':
        case 'done':
            return 'success';
        case 'processing':
        case 'in-progress':
            return 'info';
        case 'pending':
            return 'warning';
        case 'cancelled':
            return 'danger';
        default:
            return 'muted';
    }
}
