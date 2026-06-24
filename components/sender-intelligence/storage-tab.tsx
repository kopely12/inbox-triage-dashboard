'use client';

// StorageTab — shows large emails consuming Gmail storage.
// Data is fetched on-demand (may take 5-20s for large inboxes) and cached for 1 hour.

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { HardDrive, RefreshCw, Loader2, Trash2, AlertTriangle, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import { getStorageAnalysis, trashEmail, untrashEmail, type StorageResult, type LargeEmail } from '@/app/actions/engagement';

// ── Component ─────────────────────────────────────────────────────────────────

export function StorageTab() {
  const [result,  setResult]  = useState<StorageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const { result: data, error: err } = await getStorageAnalysis(force);
    setLoading(false);
    if (err) { setError(err); return; }
    if (data) setResult(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Storage Analysis</h2>
          {result && (
            <span className="text-xs text-muted-foreground">
              {result.total_scanned_mb} MB scanned · {result.messages_scanned.toLocaleString()} emails over 1 MB
              {result.from_cache && ` · cached ${new Date(result.scanned_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => load(true)}
          disabled={loading}
          title="Re-scan (may take 20–30s)"
        >
          <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', loading && 'animate-spin')} />
          {loading ? 'Scanning…' : 'Re-scan'}
        </Button>
      </div>

      {/* Loading / error states */}
      {loading && !result && (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Scanning emails over 1 MB — this may take 20–30 seconds…</p>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-6 py-3 bg-red-50 border-b border-red-200 text-red-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {result && (() => {
        const scannedMb = parseFloat(result.total_scanned_mb) || 0;
        const quotaMb   = 15 * 1024;
        const quotaPct  = Math.min(100, (scannedMb / quotaMb) * 100);
        const scannedGb = (scannedMb / 1024).toFixed(2);
        return (
          <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border shrink-0 bg-muted/30">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  Large emails ({'>'}1 MB): <strong className="text-foreground">{scannedGb} GB</strong>
                </span>
                <span className="text-xs text-muted-foreground">
                  Gmail quota: 15 GB shared · {quotaPct.toFixed(1)}% of quota
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    quotaPct > 80 ? 'bg-red-500' : quotaPct > 50 ? 'bg-amber-400' : 'bg-blue-400',
                  )}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Scan covers emails over 1 MB — Drive and Photos also count toward the 15 GB Gmail quota.
              </p>
            </div>
          </div>
        );
      })()}

      {result && (
        <div className="flex-1 overflow-auto">
          <LargeEmailTable emails={result.largest_emails} />
        </div>
      )}
    </div>
  );
}

function LargeEmailTable({ emails: initialEmails }: { emails: LargeEmail[] }) {
  const { data: session } = useSession();
  const gmailAcct = session?.user?.email ? encodeURIComponent(session.user.email) : '0';
  const [emails,   setEmails]   = useState<LargeEmail[]>(initialEmails);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (!emails.length) return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      No large emails found.
    </div>
  );

  async function handleTrash(email: LargeEmail) {
    setDeleting((prev) => new Set(prev).add(email.id));
    const { success, error } = await trashEmail(email.id);
    if (error) {
      toast.error(error);
      setDeleting((prev) => { const next = new Set(prev); next.delete(email.id); return next; });
      return;
    }
    if (success) {
      setEmails((prev) => prev.filter((e) => e.id !== email.id));
      toast.success(`Moved to trash`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            const { success: ok } = await untrashEmail(email.id);
            if (ok) {
              setEmails((prev) => [...prev, email].sort((a, b) => (b.size_bytes ?? 0) - (a.size_bytes ?? 0)));
              toast.success('Restored to inbox');
            }
          },
        },
        duration: 6000,
      });
    }
  }

  async function handleBulkTrash() {
    const ids = Array.from(selected);
    setSelected(new Set());
    setDeleting((prev) => { const next = new Set(prev); ids.forEach((id) => next.add(id)); return next; });
    const results = await Promise.all(ids.map((id) => trashEmail(id)));
    const succeeded = results.filter((r) => r.success).length;
    const failed    = results.length - succeeded;
    const trashed   = ids.filter((_, i) => results[i].success);
    setEmails((prev) => prev.filter((e) => !trashed.includes(e.id)));
    setDeleting(new Set());
    if (failed > 0) toast.error(`${failed} emails could not be moved to trash`);
    if (succeeded > 0) toast.success(`${succeeded} email${succeeded !== 1 ? 's' : ''} moved to trash`);
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-6 py-2.5 bg-primary/5 border-b border-primary/20">
          <span className="text-sm font-medium text-primary">{selected.size} selected</span>
          <Button size="sm" variant="destructive" className="h-7 text-xs ml-auto" onClick={handleBulkTrash}>
            <Trash2 className="w-3 h-3 mr-1.5" /> Delete {selected.size}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card border-b border-border z-10">
          <tr>
            <th className="px-4 py-3 w-10">
              <input type="checkbox"
                checked={selected.size === emails.length && emails.length > 0}
                onChange={() => setSelected(selected.size === emails.length ? new Set() : new Set(emails.map((e) => e.id)))}
                className="rounded border-gray-300 cursor-pointer"
              />
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Subject</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">From</th>
            <th className="px-4 py-3 text-right font-medium text-muted-foreground">Size</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Date</th>
            <th className="px-4 py-3 w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {emails.map((e) => (
            <tr key={e.id} className={cn('hover:bg-muted/30 transition-colors', selected.has(e.id) && 'bg-primary/5')}>
              <td className="px-4 py-3 w-10">
                <input type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => setSelected((prev) => { const next = new Set(prev); next.has(e.id) ? next.delete(e.id) : next.add(e.id); return next; })}
                  className="rounded border-gray-300 cursor-pointer"
                />
              </td>
              <td className="px-4 py-3 max-w-sm">
                <span className="font-medium line-clamp-1">{e.subject || '(no subject)'}</span>
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">
                {e.sender_name || e.sender_email}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-700">
                {e.size_mb} MB
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                {e.date_ts ? new Date(e.date_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1">
                  {e.thread_id && (
                    <a
                      href={`https://mail.google.com/mail/u/${gmailAcct}/#all/${e.thread_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in Gmail"
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleTrash(e)} disabled={deleting.has(e.id)} title="Move to trash">
                    {deleting.has(e.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
