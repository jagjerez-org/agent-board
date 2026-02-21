'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Editor, DiffEditor, type Monaco } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Folder, FolderOpen, File, X, Save, Loader2, ChevronRight, ChevronDown,
  FileText, Code, Database, Settings, Image, Archive, AlertCircle, Dot,
  FolderPlus, FilePlus, RefreshCw, GitBranch, Plus, Minus, Edit3, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TreeNode { name: string; path: string; type: 'file' | 'dir'; children?: TreeNode[]; childrenLoaded?: boolean; }
interface OpenFile { path: string; content: string; originalContent: string; language: string; isUnsaved: boolean; }
interface GitChange { status: string; path: string; fullPath: string; }
interface WorkingChange { staged: string | null; unstaged: string | null; isUntracked: boolean; path: string; fullPath: string; }
interface GitChangesData {
  currentBranch: string; base: string;
  branchChanges: GitChange[]; workingChanges: WorkingChange[];
  stats: { filesChanged: number; insertions: number; deletions: number; };
}

const getLanguageFromExtension = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    'ts': 'typescript', 'tsx': 'typescriptreact', 'js': 'javascript', 'jsx': 'javascriptreact',
    'dart': 'dart', 'json': 'json', 'yaml': 'yaml', 'yml': 'yaml',
    'md': 'markdown', 'html': 'html', 'css': 'css', 'scss': 'scss',
    'less': 'less', 'xml': 'xml', 'svg': 'xml', 'sql': 'sql',
    'py': 'python', 'go': 'go', 'rs': 'rust', 'java': 'java',
    'sh': 'shell', 'bash': 'shell', 'dockerfile': 'dockerfile',
    'toml': 'toml', 'ini': 'ini', 'txt': 'text', 'log': 'text',
  };
  return map[ext || ''] || 'text';
};

const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (filename.includes('package.json') || filename.includes('pubspec.yaml'))
    return <Settings className="w-4 h-4 text-blue-600" />;
  const map: Record<string, React.ReactElement> = {
    'ts': <Code className="w-4 h-4 text-blue-600" />, 'tsx': <Code className="w-4 h-4 text-blue-600" />,
    'js': <Code className="w-4 h-4 text-yellow-600" />, 'jsx': <Code className="w-4 h-4 text-yellow-600" />,
    'dart': <Code className="w-4 h-4 text-teal-600" />, 'json': <Database className="w-4 h-4 text-orange-600" />,
    'yaml': <Settings className="w-4 h-4 text-purple-600" />, 'yml': <Settings className="w-4 h-4 text-purple-600" />,
    'md': <FileText className="w-4 h-4 text-gray-600" />, 'html': <Code className="w-4 h-4 text-orange-600" />,
    'css': <Code className="w-4 h-4 text-blue-500" />, 'scss': <Code className="w-4 h-4 text-pink-600" />,
    'png': <Image className="w-4 h-4 text-green-600" />, 'jpg': <Image className="w-4 h-4 text-green-600" />,
    'svg': <Image className="w-4 h-4 text-purple-600" />, 'zip': <Archive className="w-4 h-4 text-gray-600" />,
  };
  return map[ext || ''] || <File className="w-4 h-4 text-gray-500" />;
};

const statusColor: Record<string, string> = {
  'A': 'text-green-500', 'M': 'text-yellow-500', 'D': 'text-red-500',
  'R': 'text-blue-500', 'C': 'text-blue-500', '?': 'text-gray-400',
};
const statusLabel: Record<string, string> = {
  'A': 'Added', 'M': 'Modified', 'D': 'Deleted', 'R': 'Renamed', 'C': 'Copied', '?': 'Untracked',
};

function FileTreeNode({
  node, onFileSelect, onContextAction, expandedDirs, onToggleDir, selectedFile, level = 0,
}: {
  node: TreeNode; onFileSelect: (path: string) => void;
  onContextAction: (action: 'newFile' | 'newFolder', dirPath: string) => void;
  expandedDirs: Set<string>; onToggleDir: (path: string) => void;
  selectedFile: string; level?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const isExpanded = expandedDirs.has(node.path);

  if (node.type === 'file') {
    return (
      <div className={cn("flex items-center gap-2 py-1 px-2 cursor-pointer text-sm rounded",
        selectedFile === node.path ? "bg-accent text-accent-foreground" : "hover:bg-muted/50")}
        style={{ paddingLeft: `${8 + level * 16}px` }} onClick={() => onFileSelect(node.path)}>
        {getFileIcon(node.name)}<span className="truncate flex-1">{node.name}</span>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 cursor-pointer text-sm rounded"
        style={{ paddingLeft: `${8 + level * 16}px` }} onClick={() => onToggleDir(node.path)}
        onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        {isExpanded ? <FolderOpen className="w-4 h-4 text-blue-600 shrink-0" /> : <Folder className="w-4 h-4 text-blue-600 shrink-0" />}
        <span className="truncate flex-1 font-medium">{node.name}</span>
        {hovered && (
          <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            <button className="p-0.5 hover:bg-muted rounded" title="New File" onClick={() => onContextAction('newFile', node.path)}><FilePlus className="w-3.5 h-3.5 text-muted-foreground" /></button>
            <button className="p-0.5 hover:bg-muted rounded" title="New Folder" onClick={() => onContextAction('newFolder', node.path)}><FolderPlus className="w-3.5 h-3.5 text-muted-foreground" /></button>
          </div>
        )}
      </div>
      {isExpanded && node.children && node.children.length > 0 && node.children.map(child => (
        <FileTreeNode key={child.path} node={child} onFileSelect={onFileSelect} onContextAction={onContextAction} expandedDirs={expandedDirs} onToggleDir={onToggleDir} selectedFile={selectedFile} level={level + 1} />
      ))}
      {isExpanded && !node.childrenLoaded && !node.children && (
        <div className="text-xs text-muted-foreground py-1" style={{ paddingLeft: `${8 + (level + 1) * 16}px` }}>Loading...</div>
      )}
    </div>
  );
}

// Git Changes Panel
function GitChangesPanel({ projectPath, onFileClick }: { projectPath: string; onFileClick: (path: string, mode: 'edit' | 'diff') => void; }) {
  const [data, setData] = useState<GitChangesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandBranch, setExpandBranch] = useState(true);
  const [expandWorking, setExpandWorking] = useState(true);

  const load = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/files/git-changes?path=${encodeURIComponent(projectPath)}`);
      if (r.ok) setData(await r.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [projectPath]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /></div>;
  if (!data) return <div className="text-xs text-muted-foreground p-2">No git data</div>;

  return (
    <div className="text-sm">
      {/* Stats */}
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5" />
          <span className="font-medium text-xs">{data.currentBranch}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={load}>
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </Button>
      </div>
      
      {data.stats.filesChanged > 0 && (
        <div className="px-3 py-1.5 border-b text-xs text-muted-foreground flex gap-3">
          <span>{data.stats.filesChanged} files</span>
          <span className="text-green-500">+{data.stats.insertions}</span>
          <span className="text-red-500">-{data.stats.deletions}</span>
        </div>
      )}

      {/* Branch Changes */}
      {data.branchChanges.length > 0 && (
        <div>
          <div className="px-3 py-2 flex items-center gap-1 cursor-pointer hover:bg-muted/50"
            onClick={() => setExpandBranch(!expandBranch)}>
            {expandBranch ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span className="text-xs font-medium">Branch Changes</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">{data.branchChanges.length}</Badge>
          </div>
          {expandBranch && data.branchChanges.map(c => (
            <div key={c.path} className="flex items-center gap-1.5 px-3 py-1 hover:bg-muted/50 cursor-pointer text-xs group"
              onClick={() => onFileClick(c.path, 'diff')}>
              <span className={cn("font-mono font-bold w-3 text-center shrink-0", statusColor[c.status])}>{c.status}</span>
              <span className="truncate flex-1" title={c.path}>{c.path}</span>
              <button className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded shrink-0"
                onClick={e => { e.stopPropagation(); onFileClick(c.path, 'edit'); }} title="Open file">
                <Edit3 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Working Changes */}
      {data.workingChanges.length > 0 && (
        <div>
          <div className="px-3 py-2 flex items-center gap-1 cursor-pointer hover:bg-muted/50 border-t"
            onClick={() => setExpandWorking(!expandWorking)}>
            {expandWorking ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            <span className="text-xs font-medium">Working Changes</span>
            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-auto">{data.workingChanges.length}</Badge>
          </div>
          {expandWorking && data.workingChanges.map(c => {
            const st = c.isUntracked ? '?' : (c.staged || c.unstaged || 'M');
            return (
              <div key={c.path} className="flex items-center gap-1.5 px-3 py-1 hover:bg-muted/50 cursor-pointer text-xs group"
                onClick={() => onFileClick(c.path, c.isUntracked ? 'edit' : 'diff')}>
                <span className={cn("font-mono font-bold w-3 text-center shrink-0", statusColor[st])}>{st}</span>
                <span className="truncate flex-1" title={c.path}>{c.path}</span>
                {c.staged && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">staged</Badge>}
              </div>
            );
          })}
        </div>
      )}

      {data.branchChanges.length === 0 && data.workingChanges.length === 0 && (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">No changes</div>
      )}
    </div>
  );
}

function EditorPageContent() {
  const searchParams = useSearchParams();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  const [createDialog, setCreateDialog] = useState<{ open: boolean; type: 'file' | 'folder'; parentPath: string }>({ open: false, type: 'file', parentPath: '' });
  const [newName, setNewName] = useState('');
  const [sidebarTab, setSidebarTab] = useState<'files' | 'git'>('files');
  const [diffView, setDiffView] = useState<{ file: string; original: string; modified: string; language: string } | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const loadedTypesRef = useRef<Set<string>>(new Set());

  // Quick Open (Ctrl+P)
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState('');
  const [quickOpenResults, setQuickOpenResults] = useState<Array<{ path: string; fullPath: string }>>([]);
  const [quickOpenIdx, setQuickOpenIdx] = useState(0);
  const quickOpenRef = useRef<HTMLInputElement>(null);

  // Global Search (Ctrl+Shift+F)
  const [globalSearchVisible, setGlobalSearchVisible] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<Array<{ path: string; fullPath: string; matches: Array<{ line: number; text: string }> }>>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const globalSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const project = searchParams.get('project');
    const branch = searchParams.get('branch');
    const path = searchParams.get('path');
    if (path) { setProjectPath(path); }
    else if (project && branch) {
      fetch(`/api/git/worktrees?project=${encodeURIComponent(project)}`)
        .then(r => r.json())
        .then(data => {
          const wt = (data.worktrees || []).find((w: { branch: string }) => w.branch === branch);
          if (wt?.path) setProjectPath(wt.path);
        })
        .catch(() => setError('Failed to resolve worktree path'));
    } else { setError('No project path specified'); }
  }, [searchParams]);

  const loadTree = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`/api/files/tree?path=${encodeURIComponent(projectPath)}&depth=4`);
      const data = await r.json();
      if (r.ok) {
        // Mark nodes with children as loaded
        function markLoaded(nodes: TreeNode[]): TreeNode[] {
          return nodes.map(n => ({
            ...n,
            childrenLoaded: n.type === 'dir' && n.children !== undefined,
            children: n.children ? markLoaded(n.children) : undefined,
          }));
        }
        setTree(markLoaded(data.tree || []));
      }
      else setError(data.error || 'Failed');
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }, [projectPath]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const handleFileSelect = async (filePath: string) => {
    setDiffView(null);
    if (openFiles.find(f => f.path === filePath)) { setActiveFile(filePath); return; }
    try {
      const r = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      const data = await r.json();
      if (r.ok) {
        const language = getLanguageFromExtension(filePath.split('/').pop() || '');
        setOpenFiles(prev => [...prev, { path: filePath, content: data.content, originalContent: data.content, language, isUnsaved: false }]);
        setActiveFile(filePath);
        // Load types for imports in this file
        if (language === 'typescript' || language === 'typescriptreact' || language === 'javascript' || language === 'javascriptreact') {
          loadTypesForContent(data.content);
        }
      } else { setError(data.isBinary ? 'Cannot open binary file' : (data.error || 'Failed')); }
    } catch { setError('Network error'); }
  };

  const handleGitFileClick = async (relativePath: string, mode: 'edit' | 'diff') => {
    const fullPath = `${projectPath}/${relativePath}`;
    if (mode === 'edit') {
      handleFileSelect(fullPath);
      return;
    }
    // Load diff view
    try {
      const r = await fetch(`/api/files/git-diff?path=${encodeURIComponent(projectPath)}&file=${encodeURIComponent(relativePath)}`);
      const data = await r.json();
      if (r.ok && data.diff) {
        // Parse the diff to get original and modified content
        // For simplicity, load both versions
        const language = getLanguageFromExtension(relativePath);
        
        // Get current file content
        let modified = '';
        try {
          const cr = await fetch(`/api/files/content?path=${encodeURIComponent(fullPath)}`);
          const cd = await cr.json();
          if (cr.ok) modified = cd.content;
        } catch { /* file might be deleted */ }
        
        // Get original (base) content via git show
        let original = '';
        try {
          const or2 = await fetch(`/api/files/git-show?path=${encodeURIComponent(projectPath)}&file=${encodeURIComponent(relativePath)}`);
          const od = await or2.json();
          if (or2.ok) original = od.content;
        } catch { /* new file */ }
        
        setDiffView({ file: relativePath, original, modified, language });
        setActiveFile('');
      }
    } catch { setError('Failed to load diff'); }
  };

  const handleToggleDir = async (dirPath: string) => {
    const isExpanding = !expandedDirs.has(dirPath);
    setExpandedDirs(prev => { const n = new Set(prev); n.has(dirPath) ? n.delete(dirPath) : n.add(dirPath); return n; });
    
    if (isExpanding) {
      // Check if this node needs children loaded
      const node = findNode(tree, dirPath);
      if (node && node.type === 'dir' && !node.childrenLoaded) {
        try {
          const r = await fetch(`/api/files/tree?path=${encodeURIComponent(dirPath)}&depth=1`);
          const data = await r.json();
          if (r.ok && data.tree) {
            setTree(prev => updateNodeChildren(prev, dirPath, data.tree));
          }
        } catch { /* ignore */ }
      }
    }
  };
  
  function findNode(nodes: TreeNode[], targetPath: string): TreeNode | null {
    for (const n of nodes) {
      if (n.path === targetPath) return n;
      if (n.children) {
        const found = findNode(n.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  }
  
  function updateNodeChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
    return nodes.map(n => {
      if (n.path === targetPath) {
        return { ...n, children, childrenLoaded: true };
      }
      if (n.children) {
        return { ...n, children: updateNodeChildren(n.children, targetPath, children) };
      }
      return n;
    });
  }

  const handleContentChange = (path: string, content: string) => {
    setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, content, isUnsaved: content !== f.originalContent } : f));
  };

  const handleCloseFile = (path: string) => {
    const file = openFiles.find(f => f.path === path);
    if (file?.isUnsaved && !confirm(`${file.path.split('/').pop()} has unsaved changes. Close?`)) return;
    setOpenFiles(prev => prev.filter(f => f.path !== path));
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f.path !== path);
      setActiveFile(remaining.length > 0 ? remaining[0].path : '');
    }
  };

  const handleSave = async (path?: string) => {
    const file = openFiles.find(f => f.path === (path || activeFile));
    if (!file) return;
    setSaving(true);
    try {
      const r = await fetch('/api/files/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file.path, content: file.content }) });
      if (r.ok) { setOpenFiles(prev => prev.map(f => f.path === file.path ? { ...f, originalContent: f.content, isUnsaved: false } : f)); }
      else { const data = await r.json(); setError(data.error || 'Save failed'); }
    } catch { setError('Network error saving'); }
    finally { setSaving(false); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    const fullPath = `${createDialog.parentPath}/${newName.trim()}`;
    if (createDialog.type === 'file') {
      try {
        const r = await fetch('/api/files/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fullPath, content: '' }) });
        if (r.ok) { await loadTree(); setExpandedDirs(prev => new Set(prev).add(createDialog.parentPath)); handleFileSelect(fullPath); }
        else { const data = await r.json(); setError(data.error || 'Create failed'); }
      } catch { setError('Network error'); }
    } else {
      try {
        const r = await fetch('/api/files/mkdir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: fullPath }) });
        if (r.ok) { await loadTree(); setExpandedDirs(prev => new Set(prev).add(createDialog.parentPath)); }
        else { const data = await r.json(); setError(data.error || 'Create folder failed'); }
      } catch { setError('Network error'); }
    }
    setCreateDialog({ open: false, type: 'file', parentPath: '' }); setNewName('');
  };

  const handleContextAction = (action: 'newFile' | 'newFolder', dirPath: string) => {
    setCreateDialog({ open: true, type: action === 'newFile' ? 'file' : 'folder', parentPath: dirPath }); setNewName('');
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey) {
        e.preventDefault();
        setQuickOpenVisible(v => !v);
        setQuickOpenQuery(''); setQuickOpenResults([]); setQuickOpenIdx(0);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setGlobalSearchVisible(v => !v);
        setGlobalSearchQuery(''); setGlobalSearchResults([]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeFile, openFiles]);

  // Quick Open search
  useEffect(() => {
    if (!quickOpenVisible || !quickOpenQuery || !projectPath) { setQuickOpenResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        const r = await fetch(`/api/files/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(quickOpenQuery)}&type=filename`);
        const data = await r.json();
        setQuickOpenResults(data.files || []);
        setQuickOpenIdx(0);
      } catch { /* ignore */ }
    }, 150);
    return () => clearTimeout(timeout);
  }, [quickOpenQuery, quickOpenVisible, projectPath]);

  // Focus input when opening
  useEffect(() => { if (quickOpenVisible) setTimeout(() => quickOpenRef.current?.focus(), 50); }, [quickOpenVisible]);
  useEffect(() => { if (globalSearchVisible) setTimeout(() => globalSearchRef.current?.focus(), 50); }, [globalSearchVisible]);

  // Load type definitions for imports in the current file
  const loadTypesForContent = useCallback(async (content: string) => {
    if (!monacoRef.current || !projectPath) return;
    
    // Extract package names from imports
    const importRegex = /(?:import|from)\s+['"]([^'"./][^'"]*)['"]/g;
    const packages = new Set<string>();
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      let pkg = match[1];
      // Handle scoped packages: @scope/pkg/subpath -> @scope/pkg
      if (pkg.startsWith('@')) {
        const parts = pkg.split('/');
        pkg = parts.slice(0, 2).join('/');
      } else {
        pkg = pkg.split('/')[0];
      }
      if (!loadedTypesRef.current.has(pkg)) packages.add(pkg);
    }

    if (packages.size === 0) return;

    try {
      const r = await fetch(`/api/files/types?path=${encodeURIComponent(projectPath)}&packages=${encodeURIComponent([...packages].join(','))}`);
      if (!r.ok) return;
      const data = await r.json();
      const monaco = monacoRef.current;
      for (const file of data.files || []) {
        monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, file.path);
        monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, file.path);
      }
      for (const pkg of packages) loadedTypesRef.current.add(pkg);
    } catch { /* silent */ }
  }, [projectPath]);

  const handleGlobalSearch = async () => {
    if (!globalSearchQuery || !projectPath) return;
    setGlobalSearchLoading(true);
    try {
      const r = await fetch(`/api/files/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(globalSearchQuery)}&type=content`);
      const data = await r.json();
      setGlobalSearchResults(data.results || []);
    } catch { /* ignore */ }
    finally { setGlobalSearchLoading(false); }
  };

  useEffect(() => {
    const move = (e: MouseEvent) => { if (isResizing) setSidebarWidth(Math.max(180, Math.min(500, e.clientX))); };
    const up = () => setIsResizing(false);
    if (isResizing) { document.addEventListener('mousemove', move); document.addEventListener('mouseup', up); }
    return () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
  }, [isResizing]);

  const handleEditorMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext, module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true, jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowJs: true, checkJs: true, strict: true, esModuleInterop: true, skipLibCheck: true,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false });
    monacoRef.current = monaco;
    editor.focus();
  };

  const activeFileData = openFiles.find(f => f.path === activeFile);
  const getBreadcrumb = (p: string) => p ? p.replace(projectPath, '').replace(/^\//, '') || '/' : '';

  return (
    <>
      <div className="flex overflow-hidden bg-background" style={{ height: 'calc(100vh - 3rem)' }}>
        {/* Sidebar */}
        <div className="border-r bg-card flex flex-col overflow-hidden" style={{ width: sidebarWidth, minWidth: sidebarWidth }}>
          {/* Sidebar tabs */}
          <div className="flex border-b shrink-0">
            <button className={cn("flex-1 px-3 py-2 text-xs font-medium", sidebarTab === 'files' ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:bg-muted/50")}
              onClick={() => setSidebarTab('files')}>
              <Folder className="w-3.5 h-3.5 inline mr-1.5" />Files
            </button>
            <button className={cn("flex-1 px-3 py-2 text-xs font-medium", sidebarTab === 'git' ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:bg-muted/50")}
              onClick={() => setSidebarTab('git')}>
              <GitBranch className="w-3.5 h-3.5 inline mr-1.5" />Changes
            </button>
          </div>

          {sidebarTab === 'files' ? (
            <>
              <div className="p-3 border-b flex items-center justify-between shrink-0">
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm">File Explorer</h2>
                  {projectPath && <p className="text-xs text-muted-foreground mt-0.5 truncate" title={projectPath}>{projectPath}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="New File" onClick={() => { setCreateDialog({ open: true, type: 'file', parentPath: projectPath }); setNewName(''); }}><FilePlus className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="New Folder" onClick={() => { setCreateDialog({ open: true, type: 'folder', parentPath: projectPath }); setNewName(''); }}><FolderPlus className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Refresh" onClick={loadTree}><RefreshCw className="w-4 h-4" /></Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto scrollbar-thin">
                <div className="p-2">
                  {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                  ) : error && tree.length === 0 ? (
                    <div className="flex items-center gap-2 text-destructive text-sm py-4"><AlertCircle className="w-4 h-4" />{error}</div>
                  ) : (
                    tree.map(node => (
                      <FileTreeNode key={node.path} node={node} onFileSelect={handleFileSelect} onContextAction={handleContextAction} expandedDirs={expandedDirs} onToggleDir={handleToggleDir} selectedFile={activeFile} />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              <GitChangesPanel projectPath={projectPath} onFileClick={handleGitFileClick} />
            </div>
          )}
        </div>

        {/* Resize */}
        <div className="w-1 bg-border hover:bg-primary/30 cursor-col-resize shrink-0" onMouseDown={e => { e.preventDefault(); setIsResizing(true); }} />

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          {(openFiles.length > 0 || diffView) && (
            <div className="border-b bg-muted/30 shrink-0 overflow-x-auto">
              <div className="flex">
                {openFiles.map(file => (
                  <div key={file.path} className={cn("flex items-center gap-1.5 px-3 py-2 border-r cursor-pointer text-sm shrink-0",
                    activeFile === file.path && !diffView ? "bg-background" : "bg-muted/30 hover:bg-muted/50")}
                    onClick={() => { setActiveFile(file.path); setDiffView(null); }}>
                    {getFileIcon(file.path.split('/').pop() || '')}
                    <span className="truncate max-w-32">{file.path.split('/').pop()}</span>
                    {file.isUnsaved && <Dot className="w-3 h-3 text-orange-500 -mr-1" />}
                    <button className="ml-1 p-0.5 hover:bg-muted rounded" onClick={e => { e.stopPropagation(); handleCloseFile(file.path); }}><X className="w-3 h-3" /></button>
                  </div>
                ))}
                {diffView && (
                  <div className={cn("flex items-center gap-1.5 px-3 py-2 border-r cursor-pointer text-sm shrink-0 bg-background")}>
                    <GitBranch className="w-4 h-4 text-yellow-500" />
                    <span className="truncate max-w-48">{diffView.file}</span>
                    <Badge variant="outline" className="text-[10px] px-1 py-0">diff</Badge>
                    <button className="ml-1 p-0.5 hover:bg-muted rounded" onClick={() => setDiffView(null)}><X className="w-3 h-3" /></button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Editor header */}
          {activeFileData && !diffView && (
            <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/50 shrink-0">
              <div className="flex items-center gap-2">
                {getFileIcon(activeFileData.path.split('/').pop() || '')}
                <span className="text-sm font-medium">{getBreadcrumb(activeFileData.path)}</span>
                {activeFileData.isUnsaved && <Badge variant="outline" className="text-xs">Unsaved</Badge>}
              </div>
              <Button variant="outline" size="sm" onClick={() => handleSave(activeFileData.path)} disabled={!activeFileData.isUnsaved || saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Save
              </Button>
            </div>
          )}

          {diffView && (
            <div className="flex items-center justify-between px-4 py-1.5 border-b bg-muted/50 shrink-0">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium">{diffView.file}</span>
                <Badge variant="secondary" className="text-xs">Diff View</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => { setDiffView(null); handleFileSelect(`${projectPath}/${diffView.file}`); }}>
                <Edit3 className="w-4 h-4 mr-1" />Edit
              </Button>
            </div>
          )}

          {/* Editor / Diff */}
          <div className="flex-1 overflow-hidden">
            {diffView ? (
              <DiffEditor
                height="100%"
                language={diffView.language}
                original={diffView.original}
                modified={diffView.modified}
                theme="vs-dark"
                options={{
                  readOnly: true, renderSideBySide: true, automaticLayout: true,
                  minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false,
                }}
              />
            ) : activeFileData ? (
              <Editor
                height="100%"
                language={activeFileData.language}
                value={activeFileData.content}
                theme="vs-dark"
                options={{
                  minimap: { enabled: true }, fontSize: 14, lineNumbers: 'on', wordWrap: 'on',
                  automaticLayout: true, scrollBeyondLastLine: false, tabSize: 2, insertSpaces: true,
                  suggestOnTriggerCharacters: true, quickSuggestions: true,
                  parameterHints: { enabled: true }, formatOnPaste: true,
                  bracketPairColorization: { enabled: true },
                }}
                onChange={v => handleContentChange(activeFileData.path, v || '')}
                onMount={handleEditorMount}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Monaco Code Editor</p>
                  <p className="text-sm">Select a file from the sidebar to start editing</p>
                  {projectPath && <p className="text-xs mt-2 opacity-75">Project: {projectPath}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Open (Ctrl+P) */}
      {quickOpenVisible && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={() => setQuickOpenVisible(false)}>
          <div className="w-[560px] bg-[#1e1e1e] border border-[#454545] rounded-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center border-b border-[#454545] px-3">
              <Code className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={quickOpenRef}
                className="flex-1 bg-transparent text-sm text-white px-2 py-2.5 outline-none placeholder:text-muted-foreground"
                placeholder="Search files by name..."
                value={quickOpenQuery}
                onChange={e => setQuickOpenQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setQuickOpenVisible(false);
                  if (e.key === 'ArrowDown') { e.preventDefault(); setQuickOpenIdx(i => Math.min(i + 1, quickOpenResults.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setQuickOpenIdx(i => Math.max(i - 1, 0)); }
                  if (e.key === 'Enter' && quickOpenResults[quickOpenIdx]) {
                    handleFileSelect(quickOpenResults[quickOpenIdx].fullPath);
                    setQuickOpenVisible(false);
                  }
                }}
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto scrollbar-thin">
              {quickOpenResults.length === 0 && quickOpenQuery && (
                <div className="px-4 py-3 text-xs text-muted-foreground">No files found</div>
              )}
              {quickOpenResults.map((f, i) => (
                <div
                  key={f.path}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm",
                    i === quickOpenIdx ? "bg-[#04395e]" : "hover:bg-[#2a2d2e]"
                  )}
                  onClick={() => { handleFileSelect(f.fullPath); setQuickOpenVisible(false); }}
                  onMouseEnter={() => setQuickOpenIdx(i)}
                >
                  {getFileIcon(f.path.split('/').pop() || '')}
                  <span className="text-white">{f.path.split('/').pop()}</span>
                  <span className="text-muted-foreground text-xs truncate ml-auto">{f.path}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Global Search (Ctrl+Shift+F) */}
      {globalSearchVisible && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={() => setGlobalSearchVisible(false)}>
          <div className="w-[600px] bg-[#1e1e1e] border border-[#454545] rounded-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center border-b border-[#454545] px-3 gap-2">
              <Code className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                ref={globalSearchRef}
                className="flex-1 bg-transparent text-sm text-white px-2 py-2.5 outline-none placeholder:text-muted-foreground"
                placeholder="Search in files..."
                value={globalSearchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setGlobalSearchVisible(false);
                  if (e.key === 'Enter') handleGlobalSearch();
                }}
              />
              {globalSearchLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
              {globalSearchResults.length === 0 && globalSearchQuery && !globalSearchLoading && (
                <div className="px-4 py-3 text-xs text-muted-foreground">No results. Press Enter to search.</div>
              )}
              {globalSearchResults.map(file => (
                <div key={file.path} className="border-b border-[#2a2d2e] last:border-0">
                  <div
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#2a2d2e] cursor-pointer"
                    onClick={() => { handleFileSelect(file.fullPath); setGlobalSearchVisible(false); }}
                  >
                    {getFileIcon(file.path.split('/').pop() || '')}
                    <span className="text-white text-sm font-medium">{file.path.split('/').pop()}</span>
                    <span className="text-muted-foreground text-xs truncate ml-auto">{file.path}</span>
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">{file.matches.length}</Badge>
                  </div>
                  {file.matches.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 px-6 py-1 hover:bg-[#2a2d2e] cursor-pointer text-xs"
                      onClick={() => {
                        handleFileSelect(file.fullPath);
                        setGlobalSearchVisible(false);
                        // Jump to line after editor loads
                        setTimeout(() => {
                          if (editorRef.current) {
                            editorRef.current.revealLineInCenter(m.line);
                            editorRef.current.setPosition({ lineNumber: m.line, column: 1 });
                            editorRef.current.focus();
                          }
                        }, 300);
                      }}
                    >
                      <span className="text-yellow-500 font-mono w-8 text-right shrink-0">{m.line}</span>
                      <span className="text-muted-foreground truncate">{m.text}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Dialog open={createDialog.open} onOpenChange={open => { if (!open) setCreateDialog(c => ({ ...c, open: false })); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{createDialog.type === 'file' ? 'New File' : 'New Folder'}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground truncate">In: {createDialog.parentPath.replace(projectPath, '.') || '.'}</p>
            <Input placeholder={createDialog.type === 'file' ? 'filename.ts' : 'folder-name'} value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialog(c => ({ ...c, open: false }))}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="w-6 h-6 animate-spin mr-2" />Loading editor...</div>}>
      <EditorPageContent />
    </Suspense>
  );
}
