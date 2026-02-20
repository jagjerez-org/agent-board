'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Editor } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Folder,
  FolderOpen,
  File,
  X,
  Save,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileText,
  Code,
  Database,
  Settings,
  Image,
  Archive,
  AlertCircle,
  Dot,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  language: string;
  isUnsaved: boolean;
}

// File extension to language mapping
const getLanguageFromExtension = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const languageMap: { [key: string]: string } = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'dart': 'dart',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'markdown': 'markdown',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'sass',
    'less': 'less',
    'xml': 'xml',
    'svg': 'xml',
    'sql': 'sql',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'sh': 'shell',
    'bash': 'shell',
    'zsh': 'shell',
    'ps1': 'powershell',
    'dockerfile': 'dockerfile',
    'toml': 'toml',
    'ini': 'ini',
    'cfg': 'ini',
    'conf': 'ini',
    'lock': 'text',
    'log': 'text',
    'txt': 'text',
  };
  return languageMap[ext || ''] || 'text';
};

// File extension to icon mapping
const getFileIcon = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const name = filename.toLowerCase();
  
  if (name.includes('package.json') || name.includes('pubspec.yaml')) {
    return <Settings className="w-4 h-4 text-blue-600" />;
  }
  
  const iconMap: { [key: string]: React.ReactElement } = {
    'ts': <Code className="w-4 h-4 text-blue-600" />,
    'tsx': <Code className="w-4 h-4 text-blue-600" />,
    'js': <Code className="w-4 h-4 text-yellow-600" />,
    'jsx': <Code className="w-4 h-4 text-yellow-600" />,
    'dart': <Code className="w-4 h-4 text-teal-600" />,
    'json': <Database className="w-4 h-4 text-orange-600" />,
    'yaml': <Settings className="w-4 h-4 text-purple-600" />,
    'yml': <Settings className="w-4 h-4 text-purple-600" />,
    'md': <FileText className="w-4 h-4 text-gray-600" />,
    'markdown': <FileText className="w-4 h-4 text-gray-600" />,
    'html': <Code className="w-4 h-4 text-orange-600" />,
    'css': <Code className="w-4 h-4 text-blue-500" />,
    'scss': <Code className="w-4 h-4 text-pink-600" />,
    'png': <Image className="w-4 h-4 text-green-600" />,
    'jpg': <Image className="w-4 h-4 text-green-600" />,
    'jpeg': <Image className="w-4 h-4 text-green-600" />,
    'gif': <Image className="w-4 h-4 text-green-600" />,
    'svg': <Image className="w-4 h-4 text-purple-600" />,
    'zip': <Archive className="w-4 h-4 text-gray-600" />,
    'tar': <Archive className="w-4 h-4 text-gray-600" />,
    'gz': <Archive className="w-4 h-4 text-gray-600" />,
  };
  
  return iconMap[ext || ''] || <File className="w-4 h-4 text-gray-500" />;
};

// File tree component
function FileTreeNode({ 
  node, 
  onFileSelect, 
  expandedDirs, 
  onToggleDir,
  level = 0 
}: {
  node: TreeNode;
  onFileSelect: (path: string) => void;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  level?: number;
}) {
  const isExpanded = expandedDirs.has(node.path);
  
  if (node.type === 'file') {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 cursor-pointer text-sm rounded"
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onFileSelect(node.path)}
      >
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
      </div>
    );
  }
  
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1 px-2 hover:bg-muted/50 cursor-pointer text-sm rounded"
        style={{ paddingLeft: `${8 + level * 16}px` }}
        onClick={() => onToggleDir(node.path)}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-blue-600" />
        ) : (
          <Folder className="w-4 h-4 text-blue-600" />
        )}
        <span className="truncate font-medium">{node.name}</span>
      </div>
      {isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              onFileSelect={onFileSelect}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditorPageContent() {
  const searchParams = useSearchParams();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFile, setActiveFile] = useState<string>('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [projectPath, setProjectPath] = useState<string>('');
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizing, setIsResizing] = useState(false);
  
  const resizeRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  
  // Initialize project path from URL params
  useEffect(() => {
    const project = searchParams.get('project');
    const branch = searchParams.get('branch');
    const path = searchParams.get('path');
    
    if (path) {
      setProjectPath(path);
    } else if (project && branch) {
      // Construct path from project and branch
      setProjectPath(`/tmp/kadens-worktrees/${branch}`);
    } else {
      setError('No project path specified. Use ?project=X&branch=Y or ?path=/tmp/some-worktree');
    }
  }, [searchParams]);
  
  // Load file tree
  const loadTree = useCallback(async () => {
    if (!projectPath) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/files/tree?path=${encodeURIComponent(projectPath)}&depth=2`);
      const data = await response.json();
      
      if (response.ok) {
        setTree(data.tree || []);
      } else {
        setError(data.error || 'Failed to load file tree');
      }
    } catch (err) {
      setError('Network error loading file tree');
      console.error('Tree load error:', err);
    } finally {
      setLoading(false);
    }
  }, [projectPath]);
  
  // Load file tree when project path changes
  useEffect(() => {
    loadTree();
  }, [loadTree]);
  
  // Handle file selection
  const handleFileSelect = async (filePath: string) => {
    // Check if file is already open
    const existingFile = openFiles.find(f => f.path === filePath);
    if (existingFile) {
      setActiveFile(filePath);
      return;
    }
    
    try {
      const response = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      const data = await response.json();
      
      if (response.ok) {
        const language = getLanguageFromExtension(filePath.split('/').pop() || '');
        const newFile: OpenFile = {
          path: filePath,
          content: data.content,
          originalContent: data.content,
          language,
          isUnsaved: false
        };
        
        setOpenFiles(prev => [...prev, newFile]);
        setActiveFile(filePath);
      } else {
        if (data.isBinary) {
          setError(`Cannot open binary file: ${filePath.split('/').pop()}`);
        } else {
          setError(data.error || 'Failed to load file');
        }
      }
    } catch (err) {
      setError('Network error loading file');
      console.error('File load error:', err);
    }
  };
  
  // Handle directory toggle
  const handleToggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dirPath)) {
        newSet.delete(dirPath);
      } else {
        newSet.add(dirPath);
      }
      return newSet;
    });
  };
  
  // Handle file content change
  const handleContentChange = (path: string, content: string) => {
    setOpenFiles(prev => prev.map(file => 
      file.path === path 
        ? { 
            ...file, 
            content, 
            isUnsaved: content !== file.originalContent 
          }
        : file
    ));
  };
  
  // Handle tab close
  const handleCloseFile = (path: string) => {
    const file = openFiles.find(f => f.path === path);
    if (file?.isUnsaved) {
      if (!confirm(`File ${file.path.split('/').pop()} has unsaved changes. Close anyway?`)) {
        return;
      }
    }
    
    setOpenFiles(prev => prev.filter(f => f.path !== path));
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f.path !== path);
      setActiveFile(remaining.length > 0 ? remaining[0].path : '');
    }
  };
  
  // Handle file save
  const handleSave = async (path?: string) => {
    const fileToSave = path ? openFiles.find(f => f.path === path) : openFiles.find(f => f.path === activeFile);
    if (!fileToSave) return;
    
    setSaving(true);
    try {
      const response = await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: fileToSave.path,
          content: fileToSave.content
        })
      });
      
      if (response.ok) {
        setOpenFiles(prev => prev.map(file => 
          file.path === fileToSave.path 
            ? { 
                ...file, 
                originalContent: file.content,
                isUnsaved: false 
              }
            : file
        ));
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to save file');
      }
    } catch (err) {
      setError('Network error saving file');
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, openFiles]);
  
  // Sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.max(200, Math.min(600, e.clientX));
      setSidebarWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);
  
  const activeFileData = openFiles.find(f => f.path === activeFile);
  const getBreadcrumb = (path: string) => {
    if (!path) return '';
    return path.replace(projectPath, '').replace(/^\//, '') || '/';
  };
  
  return (
    <div className="flex h-screen bg-background">
      {/* File tree sidebar */}
      <div 
        className="border-r bg-card flex flex-col"
        style={{ width: sidebarWidth }}
      >
        {/* Sidebar header */}
        <div className="p-4 border-b">
          <h2 className="font-semibold text-sm">File Explorer</h2>
          {projectPath && (
            <p className="text-xs text-muted-foreground mt-1 truncate" title={projectPath}>
              {projectPath}
            </p>
          )}
        </div>
        
        {/* File tree */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-destructive text-sm py-4">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            ) : tree.length === 0 ? (
              <div className="text-muted-foreground text-sm py-4">
                No files found
              </div>
            ) : (
              tree.map(node => (
                <FileTreeNode
                  key={node.path}
                  node={node}
                  onFileSelect={handleFileSelect}
                  expandedDirs={expandedDirs}
                  onToggleDir={handleToggleDir}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* Resize handle */}
      <div
        ref={resizeRef}
        className="w-1 bg-border hover:bg-border/80 cursor-col-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
      />
      
      {/* Editor area */}
      <div className="flex-1 flex flex-col">
        {/* Tabs */}
        {openFiles.length > 0 && (
          <div className="border-b bg-muted/30">
            <Tabs value={activeFile} onValueChange={setActiveFile} className="w-full">
              <TabsList className="w-full justify-start bg-transparent h-auto p-0 rounded-none">
                {openFiles.map(file => (
                  <TabsTrigger
                    key={file.path}
                    value={file.path}
                    className="relative rounded-none border-r data-[state=active]:bg-background data-[state=active]:shadow-none px-3 py-2 gap-2"
                  >
                    {getFileIcon(file.path.split('/').pop() || '')}
                    <span className="text-sm truncate max-w-32">
                      {file.path.split('/').pop()}
                    </span>
                    {file.isUnsaved && (
                      <Dot className="w-3 h-3 text-orange-500 -mr-1" />
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0 ml-1 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseFile(file.path);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}
        
        {/* Editor header */}
        {activeFileData && (
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
            <div className="flex items-center gap-2">
              {getFileIcon(activeFileData.path.split('/').pop() || '')}
              <span className="text-sm font-medium">
                {getBreadcrumb(activeFileData.path)}
              </span>
              {activeFileData.isUnsaved && (
                <Badge variant="outline" className="text-xs">
                  Unsaved
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSave(activeFileData.path)}
                disabled={!activeFileData.isUnsaved || saving}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}
        
        {/* Editor */}
        <div className="flex-1 relative">
          {activeFileData ? (
            <Editor
              height="100%"
              language={activeFileData.language}
              value={activeFileData.content}
              theme="vs-dark"
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                insertSpaces: true,
              }}
              onChange={(value) => handleContentChange(activeFileData.path, value || '')}
              onMount={(editor) => {
                editorRef.current = editor;
                // Focus editor
                editor.focus();
              }}
            />
          ) : openFiles.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Code className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">Monaco Code Editor</p>
                <p className="text-sm">Select a file from the sidebar to start editing</p>
                {projectPath && (
                  <p className="text-xs mt-2 opacity-75">Project: {projectPath}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading editor...</span>
        </div>
      </div>
    }>
      <EditorPageContent />
    </Suspense>
  );
}