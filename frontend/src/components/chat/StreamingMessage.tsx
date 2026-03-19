'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';

function StreamingCodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="group/code relative my-2 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between bg-secondary/80 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 transition-colors hover:text-foreground">
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: '0.8125rem', background: 'oklch(0.18 0.01 260)' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

const streamingComponents: Components = {
  code({ className, children }) {
    const isBlock = /language-(\w+)/.test(className || '') || String(children).includes('\n');
    if (isBlock) return <StreamingCodeBlock className={className}>{children}</StreamingCodeBlock>;
    return <code className="rounded bg-secondary/80 px-1.5 py-0.5 text-[0.85em] font-mono text-foreground">{children}</code>;
  },
  pre({ children }) { return <>{children}</>; },
  a({ href, children }) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-link-text underline hover:text-link-hover">{children}</a>;
  },
  blockquote({ children }) {
    return <blockquote className="border-l-2 border-accent-primary/50 pl-3 text-muted-foreground italic">{children}</blockquote>;
  },
};

interface StreamingMessageProps {
  agentName: string;
  agentEmoji: string;
  content: string;
}

export function StreamingMessage({
  agentName,
  agentEmoji,
  content,
}: StreamingMessageProps) {
  return (
    <div className="group flex items-start gap-3 px-5 pt-5 pb-1 bg-chat-hover">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-primary-subtle text-base">
        {agentEmoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">
            {agentName}
          </span>
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none bg-bot-badge-bg text-bot-badge-text">
            BOT
          </span>
          <span className="text-[10px] text-link-text animate-pulse">
            typing...
          </span>
        </div>
        <div className="prose-chat max-w-none text-sm text-foreground">
          <ReactMarkdown components={streamingComponents}>{content}</ReactMarkdown>
          <span className="inline-block h-4 w-0.5 animate-pulse bg-muted-foreground align-text-bottom" />
        </div>
      </div>
    </div>
  );
}
