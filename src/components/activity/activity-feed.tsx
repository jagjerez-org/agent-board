'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Clock, User, CheckCircle, AlertCircle, MessageSquare, GitPullRequest, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  type: 'task' | 'agent' | 'system';
  task_id?: string;
  agent_id?: string;
  metadata?: Record<string, unknown>;
}

const getActivityIcon = (title: string, type: string) => {
  if (title.includes('created')) return CheckCircle;
  if (title.includes('updated') || title.includes('changed')) return AlertCircle;
  if (title.includes('comment')) return MessageSquare;
  if (title.includes('PR') || title.includes('linked')) return GitPullRequest;
  if (title.includes('deleted')) return Trash2;
  if (type === 'agent') return User;
  return Clock;
};

const getActivityColor = (title: string, type: string) => {
  if (title.includes('created')) return 'text-green-600';
  if (title.includes('deleted')) return 'text-red-600';
  if (title.includes('comment')) return 'text-blue-600';
  if (title.includes('PR')) return 'text-purple-600';
  if (type === 'agent') return 'text-orange-600';
  return 'text-muted-foreground';
};

export function ActivityFeed() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMore, setLoadMore] = useState(false);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadActivities = async (append = false) => {
    try {
      if (!append) {
        setLoading(true);
        setError(null);
      } else {
        setLoadMore(true);
      }

      const offset = append ? activities.length : 0;
      const response = await fetch(`/api/activity?format=timeline&limit=20&offset=${offset}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch activities');
      }
      
      const data = await response.json();
      
      if (append) {
        setActivities(prev => [...prev, ...data]);
      } else {
        setActivities(data);
      }
    } catch (error) {
      console.error('Error loading activities:', error);
      setError('Failed to load activity feed. Please try again.');
    } finally {
      setLoading(false);
      setLoadMore(false);
    }
  };

  const getAgentInitials = (agentId?: string) => {
    if (!agentId) return 'S'; // System
    return agentId.replace('worker-', '').split('-').map(word => word.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  const getAgentDisplayName = (agentId?: string) => {
    if (!agentId) return 'System';
    return agentId.replace('worker-', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error && activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive text-lg mb-4">{error}</p>
          <Button onClick={() => loadActivities()} variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground text-lg mb-2">No activity yet</p>
          <p className="text-sm text-muted-foreground">
            Create some tasks or register agents to see activity here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Showing {activities.length} recent activities
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {activities.map((activity) => {
          const Icon = getActivityIcon(activity.title, activity.type);
          const iconColor = getActivityColor(activity.title, activity.type);
          
          return (
            <Card key={activity.id} className="p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-start space-x-3">
                {/* Activity Icon */}
                <div className={`mt-0.5 ${iconColor}`}>
                  <Icon className="w-4 h-4" />
                </div>

                {/* Activity Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{activity.title}</h4>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {activity.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-2 ml-4">
                      {/* Type Badge */}
                      <Badge 
                        variant={activity.type === 'task' ? 'default' : 
                                activity.type === 'agent' ? 'secondary' : 'outline'}
                        className="text-xs"
                      >
                        {activity.type}
                      </Badge>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center space-x-3">
                      {/* Agent/Actor */}
                      {activity.agent_id && (
                        <div className="flex items-center space-x-1">
                          <Avatar className="h-5 w-5">
                            <AvatarFallback className="bg-primary/10 text-xs">
                              {getAgentInitials(activity.agent_id)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-muted-foreground">
                            {getAgentDisplayName(activity.agent_id)}
                          </span>
                        </div>
                      )}

                      {/* Task ID */}
                      {activity.task_id && (
                        <Badge variant="outline" className="text-xs">
                          Task: {activity.task_id.slice(0, 8)}...
                        </Badge>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Load More Button */}
      <div className="flex justify-center pt-4">
        <Button 
          variant="outline" 
          onClick={() => loadActivities(true)}
          disabled={loadMore}
        >
          {loadMore ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Loading...
            </>
          ) : (
            'Load More'
          )}
        </Button>
      </div>
    </div>
  );
}