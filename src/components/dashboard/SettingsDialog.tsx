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
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const deleteAllMutation = useDeleteAllOrders();

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
          <DialogDescription>
            Manage your dashboard data and system settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          <div className="space-y-4">
            <h3 className="text-sm font-medium">Data Management</h3>

            <div className="p-4 rounded-lg border border-destructive/20 bg-destructive/5">
              <h4 className="text-sm font-medium text-destructive mb-2 flex items-center gap-2">
                <Trash2 className="h-4 w-4" />
                Danger Zone
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                Permanently delete all order records from the database. This action cannot be undone.
              </p>

              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
