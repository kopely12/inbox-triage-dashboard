import { supabaseAdmin } from '@/lib/supabase';

// Gets the org for a user, creating one if they're an owner with none yet.
export async function getOrCreateOrg(userId: string, userEmail: string, orgRole: string | null) {
  // Look up existing org via org_members
  const { data: membership } = await supabaseAdmin
    .from('org_members')
    .select('org_id, role, organizations(id, name)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (membership?.org_id) return membership.org_id as string;

  // Owner with no org yet — bootstrap one
  if (orgRole === 'owner') {
    const orgName = (userEmail.split('@')[1] ?? 'My Team')
      .split('.')[0]
      .replace(/^./, (c) => c.toUpperCase());

    const { data: org } = await supabaseAdmin
      .from('organizations')
      .insert({ name: `${orgName}'s Team`, owner_id: userId })
      .select('id')
      .single();

    if (!org) return null;

    // Add owner as member
    await supabaseAdmin.from('org_members').insert({
      org_id:    org.id,
      user_id:   userId,
      role:      'owner',
      status:    'active',
    });

    // Link org_id on users row
    await supabaseAdmin
      .from('users')
      .update({ org_id: org.id })
      .eq('id', userId);

    return org.id as string;
  }

  return null;
}
