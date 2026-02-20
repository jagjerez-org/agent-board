// Agent management using file-based storage
import { Agent, AgentStatus, DEFAULT_AGENTS } from './types';
import * as storage from './storage';
import { logActivity } from './activity-store';

export interface CreateAgentData {
  id: string;
  name: string;
  model?: string;
  role?: string;
  parent_agent_id?: string;
  capabilities?: string[];
}

export interface UpdateAgentData {
  name?: string;
  model?: string;
  role?: string;
  parent_agent_id?: string;
  capabilities?: string[];
  status?: AgentStatus;
  current_task_id?: string;
}

// Create or update an agent
export async function createAgent(data: CreateAgentData): Promise<Agent> {
  const agent: Agent = {
    ...data,
    status: 'idle',
    capabilities: data.capabilities || []
  };

  await storage.writeAgent(agent);
  
  await logActivity({
    agent_id: agent.id,
    action: 'agent_created',
    details: { name: agent.name, role: agent.role }
  });

  return agent;
}

// Get agent by ID
export async function getAgent(id: string): Promise<Agent | null> {
  return storage.readAgent(id);
}

// Update agent
export async function updateAgent(id: string, data: UpdateAgentData): Promise<Agent | null> {
  const existingAgent = await storage.readAgent(id);
  if (!existingAgent) return null;

  const updatedAgent: Agent = {
    ...existingAgent,
    ...data
  };

  await storage.writeAgent(updatedAgent);
  
  // Log significant changes
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  Object.keys(data).forEach(key => {
    const dataKey = key as keyof UpdateAgentData;
    const agentKey = key as keyof Agent;
    if (data[dataKey] !== (existingAgent as unknown as Record<string, unknown>)[agentKey]) {
      changes[key] = { from: (existingAgent as unknown as Record<string, unknown>)[agentKey], to: data[dataKey] };
    }
  });
  
  if (Object.keys(changes).length > 0) {
    await logActivity({
      agent_id: id,
      action: 'agent_updated',
      details: { changes }
    });
  }

  return updatedAgent;
}

// List all agents
export async function listAgents(): Promise<Agent[]> {
  return storage.listAgents();
}

// Delete agent
export async function deleteAgent(id: string): Promise<boolean> {
  const agent = await storage.readAgent(id);
  if (!agent) return false;

  const success = await storage.deleteAgent(id);
  if (success) {
    await logActivity({
      agent_id: id,
      action: 'agent_deleted',
      details: { name: agent.name }
    });
  }
  
  return success;
}

// Update agent status
export async function updateAgentStatus(id: string, status: AgentStatus, currentTaskId?: string): Promise<Agent | null> {
  const agent = await storage.readAgent(id);
  if (!agent) return null;

  const updatedAgent: Agent = {
    ...agent,
    status,
    current_task_id: currentTaskId
  };

  await storage.writeAgent(updatedAgent);
  
  await logActivity({
    agent_id: id,
    task_id: currentTaskId,
    action: 'status_changed',
    details: { from: agent.status, to: status }
  });

  return updatedAgent;
}

// Get agent hierarchy (parent-child relationships)
export async function getAgentHierarchy(): Promise<{
  roots: Agent[];
  children: Record<string, Agent[]>;
}> {
  const allAgents = await listAgents();
  
  const roots = allAgents.filter(agent => !agent.parent_agent_id);
  const children: Record<string, Agent[]> = {};

  allAgents.forEach(agent => {
    if (agent.parent_agent_id) {
      if (!children[agent.parent_agent_id]) {
        children[agent.parent_agent_id] = [];
      }
      children[agent.parent_agent_id].push(agent);
    }
  });

  return { roots, children };
}

// Get agents by status
export async function getAgentsByStatus(status?: AgentStatus): Promise<Agent[]> {
  const allAgents = await listAgents();
  
  if (!status) return allAgents;
  
  return allAgents.filter(agent => agent.status === status);
}

// Get available agents (idle status)
export async function getAvailableAgents(): Promise<Agent[]> {
  return getAgentsByStatus('idle');
}

// Seed default OpenClaw agents
export async function seedDefaultAgents(): Promise<Agent[]> {
  const existingAgents = await listAgents();
  const existingIds = new Set(existingAgents.map(a => a.id));
  
  const newAgents: Agent[] = [];
  
  for (const defaultAgent of DEFAULT_AGENTS) {
    if (!existingIds.has(defaultAgent.id)) {
      const agent: Agent = {
        ...defaultAgent,
        status: 'idle'
      };
      
      await storage.writeAgent(agent);
      newAgents.push(agent);
      
      await logActivity({
        agent_id: agent.id,
        action: 'agent_seeded',
        details: { name: agent.name, role: agent.role }
      });
    }
  }
  
  return newAgents;
}

// Assign agent to task
export async function assignAgentToTask(agentId: string, taskId: string): Promise<Agent | null> {
  const agent = await storage.readAgent(agentId);
  if (!agent) return null;

  const updatedAgent: Agent = {
    ...agent,
    status: 'busy',
    current_task_id: taskId
  };

  await storage.writeAgent(updatedAgent);
  
  await logActivity({
    agent_id: agentId,
    task_id: taskId,
    action: 'assigned_to_task',
    details: { task_id: taskId }
  });

  return updatedAgent;
}

// Free agent from current task
export async function freeAgentFromTask(agentId: string): Promise<Agent | null> {
  const agent = await storage.readAgent(agentId);
  if (!agent) return null;

  const previousTaskId = agent.current_task_id;

  const updatedAgent: Agent = {
    ...agent,
    status: 'idle',
    current_task_id: undefined
  };

  await storage.writeAgent(updatedAgent);
  
  await logActivity({
    agent_id: agentId,
    task_id: previousTaskId,
    action: 'freed_from_task',
    details: { previous_task_id: previousTaskId }
  });

  return updatedAgent;
}

// Get agent statistics
export async function getAgentStats(): Promise<{
  total: number;
  by_status: Record<AgentStatus, number>;
  by_role: Record<string, number>;
  task_assignments: Record<string, string[]>; // taskId -> agentIds
}> {
  const agents = await listAgents();
  
  const stats = {
    total: agents.length,
    by_status: { idle: 0, busy: 0, offline: 0 } as Record<AgentStatus, number>,
    by_role: {} as Record<string, number>,
    task_assignments: {} as Record<string, string[]>
  };

  agents.forEach(agent => {
    stats.by_status[agent.status]++;
    
    if (agent.role) {
      stats.by_role[agent.role] = (stats.by_role[agent.role] || 0) + 1;
    }
    
    if (agent.current_task_id) {
      if (!stats.task_assignments[agent.current_task_id]) {
        stats.task_assignments[agent.current_task_id] = [];
      }
      stats.task_assignments[agent.current_task_id].push(agent.id);
    }
  });

  return stats;
}