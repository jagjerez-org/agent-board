'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Activity, Users, FolderOpen, GitBranch, Wrench, LayoutDashboard } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Board', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/skills', label: 'Skills', icon: Wrench },
  { href: '/activity', label: 'Activity', icon: Activity },
  { href: '/worktrees', label: 'Worktrees', icon: GitBranch },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center px-6 py-3">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold">📋 Agent Board</h1>
          <nav className="flex space-x-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Button
                key={href}
                variant="ghost"
                size="sm"
                asChild
                className={(pathname === href || (href !== '/' && pathname.startsWith(href + '/'))) ? 'bg-accent text-accent-foreground' : ''}
              >
                <Link href={href}>
                  <Icon className="w-4 h-4 mr-2" />
                  {label}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
