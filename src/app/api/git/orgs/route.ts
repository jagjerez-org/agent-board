// GET /api/git/orgs - Get organizations/owners from all git providers
import { NextResponse } from 'next/server';
import { getProviders, discoverAllRepos } from '@/lib/git-service';
import type { GitProvider } from '@/lib/git-service';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

interface GitOrg {
  name: string;
  provider: string;
  repoCount: number;
}

export async function GET() {
  try {
    const providers = await getProviders();
    const allOrgs: GitOrg[] = [];
    
    // Get repo counts from current cache
    const repos = await discoverAllRepos();
    const repoCountsByOwner = repos.reduce((acc, repo) => {
      const key = `${repo.owner}|||${repo.provider}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    // Get orgs from each provider
    for (const provider of providers) {
      let providerOrgs: string[] = [];
      
      if (provider.type === 'github') {
        try {
          // Get user orgs and user login
          const userCmd = `${provider.cli} api /user --jq '.login'`;
          const orgsCmd = `${provider.cli} api /user/orgs --jq '.[].login'`;
          const membershipCmd = `${provider.cli} api /user/memberships/orgs --jq '.[].organization.login'`;
          
          const [userResult, orgsResult, membershipResult] = await Promise.allSettled([
            execAsync(userCmd),
            execAsync(orgsCmd),
            execAsync(membershipCmd)
          ]);
          
          // Add user login
          if (userResult.status === 'fulfilled') {
            const username = userResult.value.stdout.trim();
            if (username) providerOrgs.push(username);
          }
          
          // Add orgs from /user/orgs
          if (orgsResult.status === 'fulfilled') {
            const orgList = orgsResult.value.stdout.trim().split('\n').filter(Boolean);
            providerOrgs.push(...orgList);
          }
          
          // Add orgs from memberships
          if (membershipResult.status === 'fulfilled') {
            const membershipList = membershipResult.value.stdout.trim().split('\n').filter(Boolean);
            providerOrgs.push(...membershipList);
          }
          
          // Remove duplicates
          providerOrgs = [...new Set(providerOrgs)];
          
        } catch (error) {
          console.warn(`Failed to fetch GitHub orgs for ${provider.name}:`, error);
        }
        
      } else if (provider.type === 'gitlab') {
        try {
          // Resolve ~ to HOME for CLI path
          const cli = provider.cli.startsWith('~/')
            ? path.join(process.env.HOME || '/root', provider.cli.slice(2))
            : provider.cli;
          
          // Get repos and extract unique namespace owners
          const cmd = `${cli} repo list --mine --output json`;
          const { stdout } = await execAsync(cmd);
          const gitlabRepos = JSON.parse(stdout);
          
          const namespaces = new Set<string>();
          for (const repo of gitlabRepos) {
            if (repo.namespace?.full_path) {
              namespaces.add(repo.namespace.full_path);
            } else if (repo.namespace?.name) {
              namespaces.add(repo.namespace.name);
            }
          }
          
          providerOrgs = Array.from(namespaces);
          
        } catch (error) {
          console.warn(`Failed to fetch GitLab orgs for ${provider.name}:`, error);
        }
      } else if (provider.type === 'azure-devops') {
        if (provider.azureOrg && provider.azurePat) {
          try {
            const headers = {
              'Authorization': `Basic ${Buffer.from(`:${provider.azurePat}`).toString('base64')}`,
            };
            const projRes = await fetch(
              `https://dev.azure.com/${provider.azureOrg}/_apis/projects?api-version=7.1`,
              { headers }
            );
            if (projRes.ok) {
              const projData = await projRes.json();
              providerOrgs = projData.value.map((p: { name: string }) => p.name);
            }
          } catch (error) {
            console.warn(`Failed to fetch Azure DevOps projects for ${provider.name}:`, error);
          }
        }
      }

      // Always include configured orgs even if no repos discovered
      if (provider.orgs && provider.orgs.length > 0) {
        for (const org of provider.orgs) {
          if (!providerOrgs.includes(org)) {
            providerOrgs.push(org);
          }
        }
      }
      // Include account if set
      if (provider.account && !providerOrgs.includes(provider.account)) {
        providerOrgs.push(provider.account);
      }

      // Convert to GitOrg objects with repo counts
      for (const orgName of providerOrgs) {
        const repoCount = repoCountsByOwner[`${orgName}|||${provider.name}`] || 0;
        allOrgs.push({
          name: orgName,
          provider: provider.name,
          repoCount
        });
      }
    }
    
    // Also include any owners from the repos cache that might not be in provider orgs
    const uniqueOwnersFromRepos = new Set(repos.map(r => `${r.owner}|||${r.provider}`));
    for (const ownerProvider of uniqueOwnersFromRepos) {
      const [owner, providerName] = ownerProvider.split('|||');
      const repoCount = repoCountsByOwner[ownerProvider] || 0;
      
      // Only add if not already included
      if (!allOrgs.find(org => org.name === owner && org.provider === providerName)) {
        allOrgs.push({
          name: owner,
          provider: providerName,
          repoCount
        });
      }
    }
    
    // Sort by repo count (descending) then by name
    allOrgs.sort((a, b) => {
      if (b.repoCount !== a.repoCount) {
        return b.repoCount - a.repoCount;
      }
      return a.name.localeCompare(b.name);
    });
    
    return NextResponse.json({ orgs: allOrgs });
  } catch (error) {
    console.error('Error fetching git organizations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch git organizations' },
      { status: 500 }
    );
  }
}