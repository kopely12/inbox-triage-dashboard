'use client';

// StorageTab — shows which senders are consuming the most Gmail storage.
// Data is fetched on-demand (may take 5-20s for large inboxes) and cached for 1 hour.

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { HardDrive, RefreshCw, Loader2, Trash2, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn }     from '@/lib/utils';
import { getStorageAnalysis, trashEmail, type StorageResult, type StorageSender, type LargeEmail } from '@/app/actions/engagement';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mbBar(mb: string, maxMb: number) {
  const pct = Math.min(100, (parseFloat(mb) / maxMb) * 100);
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden flex-1 max-w-[120px]">
      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StorageTab({ onDeleteSender }: { onDeleteSender: (email: string) => void }) {
  const [result,   setResult]   = useState<StorageResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [tab,      setTab]      = useState<'senders' | 'emails'>('senders');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const { result: data, error: err } = await getStorageAnalysis(force);
    setLoading(false);
    if (err) { setError(err); return; }
    if (data) setResult(data);
  }, []);

  // Load on first render
  useEffect(() => { load(); }, [load]);

  const maxMb = result
    ? Math.max(...result.senders_by_storage.map((s) => parseFloat(s.total_mb)), 1)
    : 1;

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

      {result && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 px-6 pt-4 pb-2 shrink-0">
            {(['senders', 'emails'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  tab === t ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {t === 'senders' ? `Top Senders (${result.senders_by_storage.length})` : `Largest Emails (${result.largest_emails.length})`}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {tab === 'senders' ? (
              <SenderStorageTable senders={result.senders_by_storage} maxMb={maxMb} onDelete={onDeleteSender} />
            ) : (
              <LargeEmailTable emails={result.largest_emails} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SenderStorageTable({
  senders, maxMb, onDelete,
}: {
  senders: StorageSender[];
  maxMb:   number;
  onDelete: (email: string) => void;
}) {
  if (!senders.length) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No emails over 1 MB found. Your inbox is storage-efficient!
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card border-b border-border z-10">
        <tr>
          <th className="px-6 py-3 text-left font-medium text-muted-foreground">Sender</th>
          <th className="px-6 py-3 text-right font-medium text-muted-foreground">Emails</th>
          <th className="px-6 py-3 text-right font-medium text-muted-foreground">Total size</th>
          <th className="px-6 py-3 text-left font-medium text-muted-foreground hidden md:table-cell w-40">Usage</th>
          <th className="px-6 py-3 w-10" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {senders.map((s) => (
          <tr key={s.sender_email} className="hover:bg-muted/30 transition-colors">
            <td className="px-6 py-3 max-w-xs">
              <div className="font-medium truncate">{s.sender_name || s.sender_email}</div>
              {s.sender_name && <div className="text-xs text-muted-foreground truncate">{s.sender_email}</div>}
            </td>
            <td className="px-6 py-3 text-right tabular-nums text-muted-foreground">
              {s.message_count.toLocaleString()}
            </td>
            <td className="px-6 py-3 text-right tabular-nums font-medium">
              {parseFloat(s.total_mb) >= 1000
                ? `${(parseFloat(s.total_mb) / 1024).toFixed(1)} GB`
                : `${s.total_mb} MB`}
            </td>
            <td className="px-6 py-3 hidden md:table-cell">
              {mbBar(s.total_mb, maxMb)}
            </td>
            <td className="px-6 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => onDelete(s.sender_email)}
                title="Delete all emails from this sender"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LargeEmailTable({ emails: initialEmails }: { emails: LargeEmail[] }) {
  const [emails,   setEmails]   = useState<LargeEmail[]>(initialEmails);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

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
      toast.success(`Moved "${email.subject || 'email'}" to trash.`);
      setEmails((prev) => prev.filter((e) => e.id !== email.id));
    }
  }

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-card border-b border-border z-10">
        <tr>
          <th className="px-6 py-3 text-left font-medium text-muted-foreground">Subject</th>
          <th className="px-6 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">From</th>
          <th className="px-6 py-3 text-right font-medium text-muted-foreground">Size</th>
          <th className="px-6 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Date</th>
          <th className="px-6 py-3 w-10" />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {emails.map((e) => (
          <tr key={e.id} className="hover:bg-muted/30 transition-colors">
            <td className="px-6 py-3 max-w-sm">
              <span className="font-medium line-clamp-1">{e.subject || '(no subject)'}</span>
            </td>
            <td className="px-6 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[180px]">
              {e.sender_name || e.sender_email}
            </td>
            <td className="px-6 py-3 text-right tabular-nums font-medium text-amber-700">
              {e.size_mb} MB
            </td>
            <td className="px-6 py-3 text-muted-foreground hidden lg:table-cell">
              {e.date_ts ? new Date(e.date_ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
            </td>
            <td className="px-6 py-3">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                onClick={() => handleTrash(e)}
                disabled={deleting.has(e.id)}
                title="Move to trash"
              >
                {deleting.has(e.id)
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Trash2 className="w-3.5 h-3.5" />
                }
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
