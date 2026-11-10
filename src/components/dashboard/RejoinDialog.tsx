import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRejoinOrders, RejoinResult } from '@/hooks/useOrders';
import { cycleLabel, getCurrentCycleYear } from '@/utils/cycle';

const SKIP_TEXT: Record<NonNullable<RejoinResult['skip_reason']>, string> = {
  already_in_cycle: 'already in current cycle',
  already_current: 'record is already in current cycle',
  not_found: 'record not found',
};

interface RejoinDialogProps {
  orderIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function RejoinDialog({ orderIds, open, onOpenChange, onDone }: RejoinDialogProps) {
  const rejoin = useRejoinOrders();
  const [results, setResults] = useState<RejoinResult[] | null>(null);
  const target = cycleLabel(getCurrentCycleYear());

  const added = results?.filter(r => r.new_order_id) ?? [];
  const skipped = results?.filter(r => !r.new_order_id) ?? [];

  const close = (next: boolean) => {
    if (rejoin.isPending) return;
    if (!next) setResults(null);
    onOpenChange(next);
  };

  const submit = () => {
    rejoin.mutate(orderIds, {
      onSuccess: (data) => {
        setResults(data);
        onDone?.();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        {results === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Add to {target}</DialogTitle>
              <DialogDescription>
                {orderIds.length} customer{orderIds.length === 1 ? '' : 's'} will get a new order with a new receipt number.
                Customers already in the current cycle are skipped. Last cycle's records stay unchanged.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)} disabled={rejoin.isPending}>Cancel</Button>
              <Button onClick={submit} disabled={rejoin.isPending || orderIds.length === 0}>
                {rejoin.isPending ? 'Adding...' : `Add ${orderIds.length}`}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Added {added.length} to {target}</DialogTitle>
              <DialogDescription>
                {added.length > 0
                  ? `New receipt numbers ${added[0].new_receipt_no}${added.length > 1 ? ` – ${added[added.length - 1].new_receipt_no}` : ''}.`
                  : 'No new orders were created.'}
              </DialogDescription>
            </DialogHeader>
            {skipped.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-semibold">Skipped {skipped.length}</p>
                <ul className="max-h-60 overflow-y-auto text-sm text-muted-foreground space-y-1">
                  {skipped.map(r => (
                    <li key={r.source_order_id}>
                      {r.name ?? 'Unknown'}{r.old_receipt_no ? ` (#${r.old_receipt_no})` : ''}: {r.skip_reason ? SKIP_TEXT[r.skip_reason] : 'skipped'}
                      {r.existing_receipt_no ? `, receipt #${r.existing_receipt_no}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
