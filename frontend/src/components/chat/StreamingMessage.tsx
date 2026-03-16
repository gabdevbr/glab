'use client';

import ReactMarkdown from 'react-markdown';

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
      {/* Avatar */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-primary-subtle text-base">
        {agentEmoji}
      </div>

      {/* Body */}
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
        <div className="prose prose-invert prose-sm max-w-none text-sm text-foreground">
          <ReactMarkdown>{content}</ReactMarkdown>
          <span className="inline-block h-4 w-0.5 animate-pulse bg-muted-foreground align-text-bottom" />
        </div>
      </div>
    </div>
  );
}
