'use client';

import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  disconnectHubSpot,
  updateHubSpotSettings,
  triggerHubSpotSync,
} from '@/app/(dashboard)/settings/hubspot/actions';

type Pipeline = { pipeline_id: string; pipeline_label: string };

type Props = {
  portalId:         string;
  status:           'active' | 'needs_reauth';
  pipelinesEnabled: string[] | null;
  ownershipScope:   'mine' | 'team' | 'all';
  lastSyncedAt:     string | null;
  availablePipelines: Pipeline[];
};

export function HubSpotSettings({
  portalId,
  status,
  pipelinesEnabled,
  ownershipScope: initialScope,
  lastSyncedAt,
  availablePipelines,
}: Props) {
  // All pipelines ON when pipelinesEnabled is null
  const [enabledPipelines, setEnabledPipelines] = useState<Set<string>>(
    pipelinesEnabled ? new Set(pipelinesEnabled) : new Set(availablePipelines.map((p) => p.pipeline_id))
  );
  const [scope, setScope] = useState(initialScope);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function togglePipeline(id: string, checked: boolean) {
    setEnabledPipelines((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function handleSave() {
    const pipelines = enabledPipelines.size === availablePipelines.length
      ? null   // null = all enabled (no filter)
      : [...enabledPipelines];
    startTransition(async () => {
      await updateHubSpotSettings({ pipelines_enabled: pipelines, ownership_scope: scope });
    });
  }

  function handleSync() {
    setSyncMsg('Sync queued — deals will refresh within 15 minutes.');
    startTransition(async () => {
      await triggerHubSpotSync();
    });
  }

  function handleDisconnect() {
    if (!confirm('Disconnect HubSpot? Deal flags will stop appearing in your inbox.')) return;
    startTransition(async () => { await disconnectHubSpot(); });
  }

  const syncAge = lastSyncedAt
    ? Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60_000)
    : null;

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={status === 'active' ? 'default' : 'destructive'}>
            {status === 'active' ? 'Connected' : 'Reconnection needed'}
          </Badge>
          <span className="text-sm text-muted-foreground">Portal {portalId}</span>
          {syncAge !== null && (
            <span className="text-xs text-muted-foreground">· synced {syncAge}m ago</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending}>
            {syncMsg ? 'Queued' : 'Sync now'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={isPending}
            className="text-destructive hover:text-destructive">
            Disconnect
          </Button>
        </div>
      </div>

      {status === 'needs_reauth' && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Your HubSpot connection has expired.{' '}
          <a href="/api/hubspot/connect" className="underline font-medium">Reconnect HubSpot →</a>
        </div>
      )}

      {syncMsg && (
        <p className="text-sm text-muted-foreground">{syncMsg}</p>
      )}

      {/* Pipeline toggles */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Pipelines that drive flags</CardTitle>
          <CardDescription>
            Only threads tied to deals in enabled pipelines show a pill.
            Disable non-sales pipelines (renewals, ops, partnerships) to reduce noise.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {availablePipelines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pipelines found — try syncing.</p>
          ) : (
            availablePipelines.map((p) => (
              <div key={p.pipeline_id} className="flex items-center justify-between">
                <Label htmlFor={`pipeline-${p.pipeline_id}`} className="text-sm font-normal cursor-pointer">
                  {p.pipeline_label}
                </Label>
                <Switch
                  id={`pipeline-${p.pipeline_id}`}
                  checked={enabledPipelines.has(p.pipeline_id)}
                  onCheckedChange={(checked) => togglePipeline(p.pipeline_id, checked)}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Ownership scope */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Whose deals to flag</CardTitle>
          <CardDescription>
            Default is "Mine only" — the strongest noise control.
            Widen only if you need visibility into teammates&apos; pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-2">
            {([
              { value: 'mine', label: 'Mine only', note: '(recommended)' },
              { value: 'team', label: "My team's deals", note: '' },
              { value: 'all',  label: 'Everyone I can see in HubSpot', note: '' },
            ] as const).map(({ value, label, note }) => (
              <div key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  id={`scope-${value}`}
                  name="ownership-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  className="accent-primary"
                />
                <Label htmlFor={`scope-${value}`} className="text-sm font-normal cursor-pointer">
                  {label}{note && <span className="text-muted-foreground ml-1">{note}</span>}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={isPending}>
        {isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </div>
  );
}
