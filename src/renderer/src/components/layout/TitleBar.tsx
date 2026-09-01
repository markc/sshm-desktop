import React from 'react'
import { TerminalSquare } from 'lucide-react'

export const TitleBar: React.FC = () => (
  <header className="h-11 flex-shrink-0 flex items-center justify-between px-4 bg-[#212529] text-[#f8f9fa] border-b border-[#373b3e]">
    <div className="flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-md bg-[#017cb6] flex items-center justify-center">
        <TerminalSquare className="w-4 h-4 text-white" />
      </span>
      <span className="font-bold tracking-tight">
        SSHM <span className="font-normal text-[#adb5bd]">Desktop</span>
      </span>
    </div>
    <span className="text-[11px] text-[#6c757d]">Local SSH host &amp; key manager</span>
  </header>
)
