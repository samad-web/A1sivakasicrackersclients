import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useOrders } from '@/hooks/useOrders';
import {
  fetchRun, startReminders, startTestReminder, ReminderRun,
} from '@/integrations/supabase/reminders';

interface Props {
  monthName: string;
  cycleYear: number;
}

export function SendRemindersDialog({ monthName, cycleYear }: Props) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Live unpaid count for the currently-viewed month (lightweight: count only).
  const { data: unpaid } = useOrders(
    { monthName, cycleYear, paymentFilter: 'unverified' }, 0, 1,
  );
  const unpaidCount = unpaid?.count ?? 0;

  // Poll the active run for progress until it stops running.
  const { data: run } = useQuery<ReminderRun | null>({
    queryKey: ['reminder_run', runId],
    queryFn: () => fetchRun(runId as string),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== 'running' ? false : 4000;
    },
  });

  useEffect(() => {
    if (run && run.status !== 'running') {
      toast.success(`Run ${run.status}: ${run.sent_count} sent, ${run.failed_count} failed`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.status]);

  const isRunning = run?.status === 'running';
  const done = run ? run.sent_count + run.failed_count + run.skipped_count : 0;
  const pct = run && run.total_count > 0 ? Math.round((done / run.total_count) * 100) : 0;

  const handleTest = async () => {
    const phone = testPhone.trim();
    if (!phone || busy || isRunning) return;
    setBusy(true);
    const res = await startTestReminder(phone, monthName);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setRunId(res.run_id ?? null);
    toast.success('Test queued — check that phone shortly (delivery ≠ acceptance).');
  };

  const handleSend = async () => {
    if (confirmText !== 'SEND' || busy || isRunning || unpaidCount === 0) return;
    setBusy(true);
    const res = await startReminders(monthName);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    setRunId(res.run_id ?? null);
    setConfirmText('');
    toast.success(`Queued ${res.pending ?? 0} reminders for ${monthName} (${res.skipped ?? 0} skipped).`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="bg-background/50 hover:bg-primary/5 border-none ring-1 ring-border">
          <MessageSquare className="h-4 w-4 mr-2" />
          Reminders
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Payment Reminders</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-foreground">{unpaidCount}</span> customer{unpaidCount === 1 ? '' : 's'} currently unpaid for <span className="font-semibold text-foreground">{monthName}</span>. Advance-payers are already excluded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Live progress */}
          {run && (
            <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between text-sm font-medium">
                <span className="flex items-center gap-2">
                  {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                  {run.is_test ? 'Test run' : 'Run'} · {run.status}
                </span>
                <span className="text-muted-foreground">{done}/{run.total_count}</span>
              </div>
              <Progress value={pct} />
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span className="text-green-600">{run.sent_count} sent</span>
                <span className="text-destructive">{run.failed_count} failed</span>
                <span>{run.skipped_count} skipped</span>
              </div>
              {isRunning && (
                <p className="text-[11px] text-muted-foreground">
                  Sending in the background — safe to close this window.
                </p>
              )}
            </div>
          )}

          {/* Test send first */}
          <div className="space-y-2">
            <Label htmlFor="test-phone" className="text-sm font-medium">Send a test first</Label>
            <div className="flex gap-2">
              <Input
                id="test-phone" inputMode="numeric" placeholder="10-digit number"
                value={testPhone} onChange={(e) => setTestPhone(e.target.value)}
                disabled={busy || isRunning}
              />
              <Button variant="outline" onClick={handleTest} disabled={busy || isRunning || !testPhone.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Confirm it actually arrives on the handset before the real run.
            </p>
          </div>

          {/* Real send */}
          <div className="p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
            <p className="text-xs text-muted-foreground">
              Sends to all {unpaidCount} unpaid customers, paced to protect your WhatsApp
              quality rating (runs in the background over time). Type <span className="font-mono font-semibold">SEND</span> to confirm.
            </p>
            <Input
              value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type SEND to confirm" disabled={busy || isRunning || unpaidCount === 0}
            />
            <Button
              className="w-full btn-premium"
              onClick={handleSend}
              disabled={confirmText !== 'SEND' || busy || isRunning || unpaidCount === 0}
            >
              {busy ? 'Queuing…' : isRunning ? 'Run in progress…' : `Send to ${unpaidCount} unpaid`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
