'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const PUBLIC_PATHS = ['/setup'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // Skip check for public paths
    if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
      setChecking(false);
      setAuthenticated(true);
      return;
    }

    // Skip check for embedded mode
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embedded') === 'true') {
      setChecking(false);
      setAuthenticated(true);
      return;
    }

    fetch('/api/auth')
      .then(r => r.json())
      .then(data => {
        if (data.configured) {
          setAuthenticated(true);
        } else {
          router.replace('/setup');
        }
      })
      .catch(() => {
        router.replace('/setup');
      })
      .finally(() => setChecking(false));
  }, [pathname, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return null;
  }

  return <>{children}</>;
}
