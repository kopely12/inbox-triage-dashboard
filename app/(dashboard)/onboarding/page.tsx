'use client';

import { useRouter } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <div className="flex-1 flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <OnboardingFlow
        onComplete={() => router.push('/')}
      />
    </div>
  );
}
