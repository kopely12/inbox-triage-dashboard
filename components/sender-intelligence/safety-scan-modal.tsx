'use client';

// SafetyScanModal — shown before a bulk delete or deep clean executes.
// Claude scans the targeted emails for anything the user might regret deleting.

import { useState, useEffect } from 'react';
import { AlertTriangle, Shield, ShieldCheck, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { scanBeforeDelete, type SafetyFinding } from '@/app/actions/engagement';

interface Props {
  senderEmails:  string[];
  olderThanDays: number | null;
  emailCount:    number;   // approximate, for display
  onConfirm:     () => void;
  onClose:       () => void;
}

export function SafetyScanModal({ senderEmails, olderThanDays, emailCount, onConfirm, onClose }: Props) {
  const [scanning,  setScanning]  = useState(true);
  const [findings,  setFindings]  = useState<SafetyFinding[]>([]);
  const [skipped,   setSkipped]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await scanBeforeDelete(senderEmails, olderThanDays);
      if (cancelled) return;
      setScanning(false);
      if (result.error) { setError(result.error); return; }
      if (result.skipped) { setSkipped(true); return; }
      setFindings(result.findings ?? []);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const warnings = findings.filter((f) => f.severity === 'warning');
  const infos    = findings.filter((f) => f.severity === 'info');

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {scanning ? (
              <><Loader2 className="w-4 h-4 animate-spin text-primary" />Scanning for important emails…</>
            ) : findings.length > 0 ? (
              <><AlertTriangle className="w-4 h-4 text-amber-500" />Review before deleting</>
            ) : (
              <><ShieldCheck className="w-4 h-4 text-green-500" />Safe to delete</>
            )}
          </DialogTitle>
          <DialogDescription>
            {scanning
              ? `Claude is reviewing emails from ${senderEmails.length} sender${senderEmails.length !== 1 ? 's' : ''} for anything important.`
              : findings.length > 0
                ? `Found ${findings.length} item${findings.length !== 1 ? 's' : ''} worth reviewing before you delete ~${emailCount.toLocaleString()} emails.`
                : skipped
                  ? 'Could not scan emails. You can still proceed with the delete.'
                  : `No important emails found across ${senderEmails.length} sender${senderEmails.length !== 1 ? 's' : ''}. Safe to proceed.`
            }
          </DialogDescription>
        </DialogHeader>

        {/* Scanning state */}
        {scanning && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Checking for renewals, tracking numbers, and important info…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Scan failed: {error}. You can still proceed.
          </div>
        )}

        {/* Findings */}
        {!scanning && findings.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {warnings.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-amber-700 uppercase tracking-wide">Worth checking</p>
                {warnings.map((f, i) => (
                  <FindingRow key={i} finding={f} />
                ))}
              </div>
            )}
            {infos.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Informational</p>
                {infos.map((f, i) => (
                  <FindingRow key={i} finding={f} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* All clear */}
        {!scanning && findings.length === 0 && !error && (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <Shield className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800">
              No renewals, tracking numbers, or important one-time emails found. Good to go.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={scanning}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={scanning}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {findings.length > 0
              ? `Delete anyway (~${emailCount.toLocaleString()} emails)`
              : `Delete ~${emailCount.toLocaleString()} emails`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FindingRow({ finding }: { finding: SafetyFinding }) {
  return (
    <div className={cn(
      'flex items-start gap-2.5 p-2.5 rounded-lg border text-sm',
      finding.severity === 'warning'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-muted/30 border-border',
    )}>
      <AlertTriangle className={cn(
        'w-3.5 h-3.5 shrink-0 mt-0.5',
        finding.severity === 'warning' ? 'text-amber-600' : 'text-muted-foreground',
      )} />
      <div className="min-w-0">
        <p className="font-medium truncate">{finding.subject}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {finding.sender} · {finding.reason}
        </p>
      </div>
    </div>
  );
}
