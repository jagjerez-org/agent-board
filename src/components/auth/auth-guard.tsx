'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const PUBLIC_PATHS = ['/setup'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
  const isEmbedded = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('embedded') === 'true';
  const skipAuth = isPublic || isEmbedded;

  const [checking, setChecking] = useState(!skipAuth);
  const [authenticated, setAuthenticated] = useState(skipAuth);

  useEffect(() => {
    if (skipAuth) return;

    let cancelled = false;
    fetch('/api/auth')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.configured) {
          setAuthenticated(true);
        } else {
          router.replace('/setup');
        }
      })
      .catch(() => {
        if (!cancelled) router.replace('/setup');
      })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [pathname, router, skipAuth]);

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
