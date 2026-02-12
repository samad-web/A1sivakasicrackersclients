import { useState, useEffect } from 'react';
import { Settings, Save, Webhook, Trash2, Database, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useDeleteAllOrders } from '@/hooks/useOrders';

export function SettingsDialog() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const deleteAllMutation = useDeleteAllOrders();

  useEffect(() => {
    const savedWebhook = localStorage.getItem('n8n_webhook_url');
    if (savedWebhook) setWebhookUrl(savedWebhook);
  }, []);

  const handleSave = () => {
    localStorage.setItem('n8n_webhook_url', webhookUrl);
    toast.success('Configuration saved');
  };

  const handleDeleteAll = () => {
    if (deleteConfirmation === 'DELETE') {
      deleteAllMutation.mutate(undefined, {
        onSuccess: () => {
          setShowDeleteConfirm(false);
          setDeleteConfirmation('');
        }
      });
    }
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
          <DialogDescription>
            Configure your n8n webhooks and manage data
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">General Configuration</h3>
            <div className="space-y-2">
              <Label htmlFor="webhook">n8n General Webhook URL</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Webhook className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="webhook"
                    placeholder="https://your-n8n-instance.com/webhook/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This webhook is triggered for payment verification and invoice generation events.
              </p>
            </div>
          </div>

          <div className="space-y-4 border-t pt-4">
            <h3 className="text-sm font-medium">Data Management</h3>

            <div className="pt-4 border-t">
              <h4 className="text-sm font-medium text-destructive mb-4">Danger Zone</h4>

              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full sm:w-auto">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete All Records
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete all order records from the database.
                      Please type "DELETE" to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-2">
                    <Input
                      value={deleteConfirmation}
                      onChange={(e) => setDeleteConfirmation(e.target.value)}
                      placeholder="Type DELETE to confirm"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteConfirmation !== 'DELETE' || deleteAllMutation.isPending}
                      onClick={handleDeleteAll}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <Button onClick={handleSave} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
