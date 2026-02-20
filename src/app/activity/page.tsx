import { Button } from '@/components/ui/button';
import { Settings, Activity, Users, GitBranch, FolderOpen } from 'lucide-react';
import Link from 'next/link';
import { ActivityFeed } from '@/components/activity/activity-feed';

export default function ActivityPage() {
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}

      {/* Main content */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-2">Activity Feed</h2>
            <p className="text-muted-foreground">
              Track all task and agent activities across your workspace.
            </p>
          </div>
          
          <ActivityFeed />
        </div>
      </main>
    </div>
  );
}