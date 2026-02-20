import { Button } from '@/components/ui/button';
import { Plus, Activity, Users } from 'lucide-react';
import Link from 'next/link';
import { AgentOrgChart } from '@/components/agents/agent-org-chart';

export default function AgentsPage() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">📋 Agent Board</h1>
            <nav className="flex space-x-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/">Board</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/agents" className="bg-accent text-accent-foreground">
                  <Users className="w-4 h-4 mr-2" />
                  Agents
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/activity">
                  <Activity className="w-4 h-4 mr-2" />
                  Activity
                </Link>
              </Button>
            </nav>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              Seed Agents
            </Button>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Register Agent
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Agent Organization</h2>
            <p className="text-muted-foreground">
              View and manage AI agents in your OpenClaw system.
            </p>
          </div>
          
          <AgentOrgChart />
        </div>
      </main>
    </div>
  );
}