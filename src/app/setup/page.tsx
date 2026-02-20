'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Key, Server, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [gatewayUrl, setGatewayUrl] = useState('http://localhost:18789');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), gatewayUrl: gatewayUrl.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to validate API key');
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/'), 1500);
    } catch {
      setError('Connection failed. Is the Agent Board server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md mx-auto p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">📋</div>
          <h1 className="text-3xl font-bold">Agent Board</h1>
          <p className="text-muted-foreground mt-2">
            Connect to your OpenClaw gateway to get started
          </p>
        </div>

        {success ? (
          <div className="text-center space-y-4 animate-in fade-in">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-green-500">Connected!</h2>
            <p className="text-muted-foreground">Redirecting to board...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="gateway-url" className="flex items-center gap-2">
                <Server className="w-4 h-4" /> Gateway URL
              </Label>
              <Input
                id="gateway-url"
                value={gatewayUrl}
                onChange={e => setGatewayUrl(e.target.value)}
                placeholder="http://localhost:18789"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                The URL where your OpenClaw gateway is running
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key" className="flex items-center gap-2">
                <Key className="w-4 h-4" /> API Key
              </Label>
              <Input
                id="api-key"
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="Enter your OpenClaw gateway token"
                className="font-mono text-sm"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Found in <code className="bg-muted px-1 rounded">~/.openclaw/openclaw.json</code> → <code className="bg-muted px-1 rounded">gateway.auth.token</code>
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading || !token.trim()}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
