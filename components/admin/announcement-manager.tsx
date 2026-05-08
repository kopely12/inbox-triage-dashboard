'use client';

import { useState, useTransition } from 'react';
import { Megaphone, Radio, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button }   from '@/components/ui/button';
import { Label }    from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge }    from '@/components/ui/badge';
import { saveAnnouncement } from '@/app/actions/admin-announcements';
import { toast } from 'sonner';
import type { AnnouncementConfig, AnnouncementType } from '@/lib/get-announcement';

const TYPE_LABELS: Record<AnnouncementType, string> = {
  info:    'Info',
  warning: 'Warning',
  error:   'Outage',
  success: 'Resolved',
};

const TYPE_STYLES: Record<AnnouncementType, string> = {
  info:    'bg-blue-50    text-blue-700    border-blue-300',
  warning: 'bg-amber-50   text-amber-700   border-amber-300',
  error:   'bg-red-50     text-red-700     border-red-300',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-300',
};

export function AnnouncementManager({ current }: { current: AnnouncementConfig | null }) {
  const [open, setOpen]            = useState(false);
  const [message, setMessage]      = useState(current?.message ?? '');
  const [type, setType]            = useState<AnnouncementType>(current?.type ?? 'info');
  const [pending, startTransition] = useTransition();

  function handleSave(active: boolean) {
    startTransition(async () => {
      const result = await saveAnnouncement({ message: message.trim(), type, active });
      if (result.ok) {
        toast.success(active ? 'Announcement published to all users.' : 'Announcement unpublished.');
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const isActive = current?.active;

  return (
    <>
      {/* Compact status strip */}
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <Megaphone className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-muted-foreground shrink-0">Announcement</span>
          {isActive ? (
            <>
              <Badge variant="outline" className={`text-xs shrink-0 ${TYPE_STYLES[current!.type]}`}>
                {TYPE_LABELS[current!.type]}
              </Badge>
              <span className="text-muted-foreground truncate hidden sm:inline italic">
                "{current!.message}"
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No active announcement</span>
          )}
        </div>
        <Button
          size="sm"
          variant={isActive ? 'default' : 'outline'}
          className="h-7 text-xs shrink-0"
          onClick={() => setOpen(true)}
        >
          {isActive ? 'Edit / Unpublish' : 'Create'}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Announcement banner</DialogTitle>
            <DialogDescription>
              When active, this message appears at the top of every dashboard page for
              all users. Users can dismiss it per-session — it reappears automatically
              if the message is updated.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Message */}
            <div className="space-y-1.5">
              <Label htmlFor="ann-message">Message</Label>
              <Textarea
                id="ann-message"
                rows={3}
                placeholder="e.g. We're experiencing issues with email sync. Our team is investigating."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="resize-none text-sm"
              />
            </div>

            {/* Type picker */}
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2 flex-wrap">
                {(Object.keys(TYPE_LABELS) as AnnouncementType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      type === t
                        ? TYPE_STYLES[t]
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {message.trim() && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${TYPE_STYLES[type]}`}>
                <span className="truncate">{message.trim()}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={() => handleSave(true)}
                disabled={!message.trim() || pending}
              >
                {pending
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Radio    className="w-4 h-4 mr-2" />
                }
                Publish to all users
              </Button>
              {isActive && (
                <Button variant="outline" onClick={() => handleSave(false)} disabled={pending}>
                  Unpublish
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
