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
    <div className="group flex items-start gap-2 px-4 pt-2 pb-0.5 bg-slate-800/20">
      {/* Avatar */}
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-base">
        {agentEmoji}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-100">
            {agentName}
          </span>
          <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium leading-none bg-indigo-500/20 text-indigo-300">
            BOT
          </span>
          <span className="text-[10px] text-indigo-400 animate-pulse">
            typing...
          </span>
        </div>
        <div className="prose prose-invert prose-sm max-w-none text-sm text-slate-200">
          <ReactMarkdown>{content}</ReactMarkdown>
          <span className="inline-block h-4 w-0.5 animate-pulse bg-slate-400 align-text-bottom" />
        </div>
      </div>
    </div>
  );
}
