'use client'

import { Browser } from '@/components/browser'
import { Terminal } from '@/components/terminal'
import { Logs } from '@/components/logs'
import { Controls } from '@/components/controls'
import {
  PanelResizeHandle,
  Panel,
  PanelGroup,
} from 'react-resizable-panels'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function HudContent() {
  const searchParams = useSearchParams()
  const entryUrl = searchParams.get('url') || 'http://localhost:3000'
  const sessionId = searchParams.get('sid') || 'default'

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      {/* Header with controls */}
      <div className="flex-none border-b bg-white dark:bg-gray-800 p-2">
        <Controls sessionId={sessionId} entryUrl={entryUrl} />
      </div>

      {/* Main content area */}
      <PanelGroup direction="horizontal" className="flex-1">
        {/* Left side - Browser */}
        <Panel defaultSize={60} minSize={30}>
          <Browser entryUrl={entryUrl} sessionId={sessionId} />
        </Panel>
        
        <PanelResizeHandle className="w-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 transition-colors" />
        
        {/* Right side - Terminal and Logs */}
        <Panel defaultSize={40} minSize={20}>
          <PanelGroup direction="vertical">
            <Panel defaultSize={50} minSize={20}>
              <Terminal sessionId={sessionId} />
            </Panel>
            
            <PanelResizeHandle className="h-1 bg-gray-200 dark:bg-gray-700 hover:bg-blue-500 transition-colors" />
            
            <Panel defaultSize={50} minSize={20}>
              <Logs sessionId={sessionId} />
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading HUD...</div>}>
      <HudContent />
    </Suspense>
  )
}