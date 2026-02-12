import { Edit2, ExternalLink, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Order } from '@/types/order';
import { OrderForm } from './OrderForm';
import { useState } from 'react';
import { useDeleteOrder } from '@/hooks/useOrders';

interface OrderActionsProps {
  order: Order;
}

export function OrderActions({ order }: OrderActionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const deleteMutation = useDeleteOrder();
  const isLocked = order.payment_verified && order.order_completed;

  const handleDelete = () => {
    deleteMutation.mutate(order.id);
  };

  return (
    <div className="flex items-center gap-1">
      {order.invoice_url && (
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
          <a href={order.invoice_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      )}

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DialogTrigger asChild>
                <DropdownMenuItem disabled={isLocked}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit Record
                </DropdownMenuItem>
              </DialogTrigger>
              <DropdownMenuItem
                className="text-primary"
                onClick={() => {
                  const text = `Hello ${order.name}, your order ${order.receipt_no} status: ${order.order_completed ? 'Completed' : 'Pending'}`;
                  window.open(`https://wa.me/${order.number}?text=${encodeURIComponent(text)}`, '_blank');
                }}
              >
                WhatsApp
              </DropdownMenuItem>

              <AlertDialogTrigger asChild>
                <DropdownMenuItem disabled={isLocked} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Record
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>

          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Record - {order.receipt_no}</DialogTitle>
              <DialogDescription>
                Make changes to the order details below.
              </DialogDescription>
            </DialogHeader>
            <OrderForm order={order} onSuccess={() => setIsOpen(false)} />
          </DialogContent>
        </Dialog>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the record for {order.name} ({order.receipt_no}) for the month of {order.current_month}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
