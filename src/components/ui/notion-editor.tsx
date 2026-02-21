'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import { useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  CheckSquare,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Link as LinkIcon,
  Undo,
  Redo,
} from 'lucide-react';

interface NotionEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

// Convert markdown to HTML (simple conversion for tiptap)
function markdownToHtml(md: string): string {
  if (!md) return '';
  let html = md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    // Headings
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Task lists
    .replace(/^- \[x\] (.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">$1</li></ul>')
    .replace(/^- \[ \] (.+)$/gm, '<ul data-type="taskList"><li data-type="taskItem" data-checked="false">$1</li></ul>')
    // Unordered lists
    .replace(/^[*-] (.+)$/gm, '<ul><li>$1</li></ul>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<ol><li>$1</li></ol>')
    // Blockquote
    .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    // Bold, italic, strikethrough, code
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Paragraphs (lines not already wrapped)
    .replace(/^(?!<[houpba]|<li|<hr)(.*\S.*)$/gm, '<p>$1</p>');
  
  // Merge adjacent same-type lists
  html = html
    .replace(/<\/ul>\s*<ul>/g, '')
    .replace(/<\/ol>\s*<ol>/g, '')
    .replace(/<\/ul>\s*<ul data-type="taskList">/g, '')
    .replace(/<\/blockquote>\s*<blockquote>/g, '');
  
  return html;
}

// Convert tiptap HTML back to markdown
function htmlToMarkdown(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  
  function processNode(node: Node, listDepth = 0): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const children = () => Array.from(el.childNodes).map(n => processNode(n, listDepth)).join('');
    
    switch (tag) {
      case 'h1': return `# ${children()}\n\n`;
      case 'h2': return `## ${children()}\n\n`;
      case 'h3': return `### ${children()}\n\n`;
      case 'p': return `${children()}\n\n`;
      case 'strong': case 'b': return `**${children()}**`;
      case 'em': case 'i': return `*${children()}*`;
      case 's': case 'del': return `~~${children()}~~`;
      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') return children();
        return `\`${children()}\``;
      }
      case 'pre': {
        const code = el.querySelector('code');
        const lang = code?.className?.match(/language-(\w+)/)?.[1] || '';
        const text = code?.textContent || el.textContent || '';
        return `\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
      }
      case 'a': return `[${children()}](${el.getAttribute('href') || ''})`;
      case 'blockquote': {
        const inner = children().trim().split('\n').map(l => `> ${l}`).join('\n');
        return `${inner}\n\n`;
      }
      case 'hr': return `---\n\n`;
      case 'br': return '\n';
      case 'ul': {
        const isTaskList = el.getAttribute('data-type') === 'taskList';
        return Array.from(el.children).map(li => {
          if (isTaskList || li.getAttribute('data-type') === 'taskItem') {
            const checked = li.getAttribute('data-checked') === 'true';
            const indent = '  '.repeat(listDepth);
            const text = Array.from(li.childNodes).map(n => {
              if ((n as HTMLElement).tagName?.toLowerCase() === 'label') return '';
              if ((n as HTMLElement).tagName?.toLowerCase() === 'ul') return processNode(n, listDepth + 1);
              return processNode(n, listDepth);
            }).join('').trim();
            return `${indent}- [${checked ? 'x' : ' '}] ${text}\n`;
          }
          const indent = '  '.repeat(listDepth);
          const text = Array.from(li.childNodes).map(n => {
            if ((n as HTMLElement).tagName?.toLowerCase() === 'ul' || (n as HTMLElement).tagName?.toLowerCase() === 'ol')
              return processNode(n, listDepth + 1);
            return processNode(n, listDepth);
          }).join('').trim();
          return `${indent}- ${text}\n`;
        }).join('') + (listDepth === 0 ? '\n' : '');
      }
      case 'ol': {
        let i = 1;
        return Array.from(el.children).map(li => {
          const indent = '  '.repeat(listDepth);
          const text = Array.from(li.childNodes).map(n => {
            if ((n as HTMLElement).tagName?.toLowerCase() === 'ul' || (n as HTMLElement).tagName?.toLowerCase() === 'ol')
              return processNode(n, listDepth + 1);
            return processNode(n, listDepth);
          }).join('').trim();
          return `${indent}${i++}. ${text}\n`;
        }).join('') + (listDepth === 0 ? '\n' : '');
      }
      case 'li': return children();
      default: return children();
    }
  }
  
  return Array.from(div.childNodes).map(n => processNode(n)).join('').replace(/\n{3,}/g, '\n\n').trim();
}

function ToolbarButton({ 
  onClick, 
  active, 
  children, 
  title 
}: { 
  onClick: () => void; 
  active?: boolean; 
  children: React.ReactNode; 
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-accent transition-colors',
        active && 'bg-accent text-accent-foreground'
      )}
    >
      {children}
    </button>
  );
}

export function NotionEditor({ content, onChange, placeholder = 'Start writing...', className, editable = true }: NotionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false, autolink: true }),
    ],
    content: markdownToHtml(content),
    editable,
    editorProps: {
      attributes: {
        class: 'notion-editor-content outline-none min-h-[120px] px-3 py-2',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const md = htmlToMarkdown(html);
      onChange(md);
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentMd = htmlToMarkdown(editor.getHTML());
      if (currentMd !== content) {
        editor.commands.setContent(markdownToHtml(content));
      }
    }
  }, [content, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={cn('border rounded-md overflow-hidden bg-background', className)}>
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b bg-muted/30 flex-wrap">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo className="w-3.5 h-3.5" />
          </ToolbarButton>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Heading 1">
            <Heading1 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Heading 2">
            <Heading2 className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Heading 3">
            <Heading3 className="w-3.5 h-3.5" />
          </ToolbarButton>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold">
            <Bold className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic">
            <Italic className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Inline code">
            <Code className="w-3.5 h-3.5" />
          </ToolbarButton>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
            <List className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Ordered list">
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Task list">
            <CheckSquare className="w-3.5 h-3.5" />
          </ToolbarButton>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">
            <Quote className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
            <Minus className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={setLink} active={editor.isActive('link')} title="Link">
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Code block">
            <Code className="w-3.5 h-3.5" />
          </ToolbarButton>
        </div>
      )}

      {/* Editor content */}
      <EditorContent editor={editor} />
    </div>
  );
}
