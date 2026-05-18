import { auth }          from '@/auth';
import { supabaseAdmin }  from '@/lib/supabase';
import { redirect }       from 'next/navigation';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pinSender, suppressSender, clearSenderRule } from '@/app/actions/senders';
import { Pin, EyeOff, X, Info } from 'lucide-react';

// ─── helpers ──────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct  = Math.round(score * 100);
  const color = score >= 0.7 ? 'bg-green-500'
              : score >= 0.4 ? 'bg-blue-500'
              :                'bg-slate-300 dark:bg-slate-600';
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

function RuleBadge({ value }: { value: string }) {
  if (value === 'always') return (
    <Badge variant="default" className="text-[10px] py-0 gap-1">
      <Pin className="w-2.5 h-2.5" /> Pinned
    </Badge>
  );
  if (value === 'never') return (
    <Badge variant="secondary" className="text-[10px] py-0 gap-1 text-muted-foreground">
      <EyeOff className="w-2.5 h-2.5" /> Suppressed
    </Badge>
  );
  return null;
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = session.user.id;

  const [
    { data: rawScores },
    { data: rules },
  ] = await Promise.all([
    // Top senders by engagement — highest interaction volume first
    supabaseAdmin
      .from('sender_scores')
      .select('sender_email, sender_domain, score, reply_count, dismiss_count, last_updated')
      .eq('user_id', userId)
      .order('reply_count', { ascending: false })
      .limit(50),

    // All explicit override rules
    supabaseAdmin
      .from('sender_rules')
      .select('sender_email, sender_domain, rule_type, rule_value, created_from, created_at')
      .eq('user_id', userId)
      .eq('rule_type', 'priority')
      .order('created_at', { ascending: false }),
  ]);

  const scores    = rawScores ?? [];
  const rulesList = rules     ?? [];

  // Build a quick lookup: email/domain → rule_value
  const ruleMap = new Map<string, string>();
  for (const r of rulesList) {
    const key = r.sender_email || r.sender_domain || '';
    if (key) ruleMap.set(key, r.rule_value);
  }

  const pinnedCount     = rulesList.filter((r) => r.rule_value === 'always').length;
  const suppressedCount = rulesList.filter((r) => r.rule_value === 'never').length;

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold">Sender Intelligence</h2>
        <p className="text-sm text-muted-foreground">
          See how the extension scores your senders and override the defaults.
          Pinned senders always surface; suppressed senders never do.
        </p>
      </div>

      {/* Summary chips */}
      {(pinnedCount > 0 || suppressedCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {pinnedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Pin className="w-3.5 h-3.5" />
              <span><strong className="text-foreground">{pinnedCount}</strong> pinned</span>
            </div>
          )}
          {suppressedCount > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <EyeOff className="w-3.5 h-3.5" />
              <span><strong className="text-foreground">{suppressedCount}</strong> suppressed</span>
            </div>
          )}
        </div>
      )}

      {/* Sender scores table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Sender scores</CardTitle>
          <CardDescription>
            Scores are built automatically from your reply and dismiss history.
            Override any sender with the buttons on the right.
          </CardDescription>
        </CardHeader>

        {scores.length === 0 ? (
          <CardContent>
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <Info className="w-5 h-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No sender data yet. Run a triage to start building your intelligence profile.
              </p>
            </div>
          </CardContent>
        ) : (
          <div className="divide-y divide-border">
            {scores.map((s) => {
              const key      = s.sender_email || s.sender_domain || '';
              const ruleVal  = ruleMap.get(key);
              const label    = s.sender_email || s.sender_domain || '—';
              const total    = (s.reply_count ?? 0) + (s.dismiss_count ?? 0);
              return (
                <div key={key} className="px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {/* Sender identity */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{label}</span>
                        {ruleVal && <RuleBadge value={ruleVal} />}
                      </div>
                      <ScoreBar score={s.score ?? 0.5} />
                      {total > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {s.reply_count ?? 0} repl{(s.reply_count ?? 0) === 1 ? 'y' : 'ies'}
                          {' · '}
                          {s.dismiss_count ?? 0} dismiss{(s.dismiss_count ?? 0) === 1 ? '' : 'es'}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {ruleVal ? (
                        /* Clear existing rule */
                        <form action={clearSenderRule}>
                          <input type="hidden" name="sender_email"  value={s.sender_email  ?? ''} />
                          <input type="hidden" name="sender_domain" value={s.sender_domain ?? ''} />
                          <Button variant="ghost" size="sm" type="submit"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                            <X className="w-3 h-3" /> Clear
                          </Button>
                        </form>
                      ) : (
                        <>
                          <form action={pinSender}>
                            <input type="hidden" name="sender_email"  value={s.sender_email  ?? ''} />
                            <input type="hidden" name="sender_domain" value={s.sender_domain ?? ''} />
                            <Button variant="ghost" size="sm" type="submit"
                              className="h-7 px-2 text-xs gap-1" title="Always surface this sender">
                              <Pin className="w-3 h-3" /> Pin
                            </Button>
                          </form>
                          <form action={suppressSender}>
                            <input type="hidden" name="sender_email"  value={s.sender_email  ?? ''} />
                            <input type="hidden" name="sender_domain" value={s.sender_domain ?? ''} />
                            <Button variant="ghost" size="sm" type="submit"
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground" title="Never surface this sender">
                              <EyeOff className="w-3 h-3" /> Suppress
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Explicit rules list */}
      {rulesList.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Override rules</CardTitle>
            <CardDescription>
              Rules you&apos;ve set manually — these take precedence over learned scores.
            </CardDescription>
          </CardHeader>
          <div className="divide-y divide-border">
            {rulesList.map((r) => {
              const label = r.sender_email || r.sender_domain || '—';
              return (
                <div key={`${r.sender_email}|${r.sender_domain}|${r.rule_value}`}
                  className="px-5 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="text-sm truncate">{label}</span>
                    <RuleBadge value={r.rule_value} />
                    {r.created_from && r.created_from !== 'correction' && (
                      <span className="text-xs text-muted-foreground capitalize">{r.created_from}</span>
                    )}
                  </div>
                  <form action={clearSenderRule}>
                    <input type="hidden" name="sender_email"  value={r.sender_email  ?? ''} />
                    <input type="hidden" name="sender_domain" value={r.sender_domain ?? ''} />
                    <Button variant="ghost" size="sm" type="submit"
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground">
                      <X className="w-3 h-3" /> Remove
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        </Card>
      )}

    </div>
  );
}
