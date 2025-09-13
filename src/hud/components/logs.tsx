'use client'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useEffect, useState, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface LogEvent {
  ts: number
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error'
  module: string
  func: string
  msg: string
  kv: Record<string, any>
}

interface LogsProps {
  sessionId: string
  className?: string
}

export function Logs({ sessionId, className }: LogsProps) {
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [filter, setFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState<string>('all')
  const wsRef = useRef<WebSocket | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Connect to WebSocket for real-time logs
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/logs/websocket?sessionId=${sessionId}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Logs WebSocket connected')
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const logEvent = JSON.parse(event.data)
        setLogs(prev => [...prev, logEvent])
        
        // Auto-scroll to bottom
        setTimeout(() => {
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
          }
        }, 100)
      } catch (error) {
        console.error('Error parsing log event:', error)
      }
    }

    ws.onclose = () => {
      console.log('Logs WebSocket disconnected')
      setIsConnected(false)
    }

    ws.onerror = (error) => {
      console.error('Logs WebSocket error:', error)
      setIsConnected(false)
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [sessionId])

  const filteredLogs = logs.filter(log => {
    const matchesFilter = filter === '' || 
      log.msg.toLowerCase().includes(filter.toLowerCase()) ||
      log.module.toLowerCase().includes(filter.toLowerCase()) ||
      log.func.toLowerCase().includes(filter.toLowerCase())
    
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter
    
    return matchesFilter && matchesLevel
  })

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600 dark:text-red-400'
      case 'warn': return 'text-yellow-600 dark:text-yellow-400'
      case 'info': return 'text-blue-600 dark:text-blue-400'
      case 'debug': return 'text-purple-600 dark:text-purple-400'
      case 'trace': return 'text-gray-600 dark:text-gray-400'
      default: return 'text-gray-800 dark:text-gray-200'
    }
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Logs</h3>
          <span className={cn(
            "text-xs px-2 py-0.5 rounded",
            isConnected 
              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
              : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
          )}>
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          <span className="text-xs text-gray-500">
            {filteredLogs.length} events
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="text-xs px-2 py-1 border rounded bg-white dark:bg-gray-700"
          >
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
            <option value="trace">Trace</option>
          </select>
          
          <button
            onClick={clearLogs}
            className="text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Filter input */}
      <div className="p-2 border-b">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter logs..."
          className="w-full px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Logs content */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="p-2 space-y-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">
              {logs.length === 0 ? 'No logs yet' : 'No logs match current filter'}
            </div>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className="text-xs font-mono border-l-2 border-gray-200 dark:border-gray-700 pl-2 py-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-gray-500">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                  <span className={cn(
                    'px-1 py-0.5 rounded text-xs font-bold uppercase',
                    getLevelColor(log.level)
                  )}>
                    {log.level}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">
                    {log.module}:{log.func}
                  </span>
                </div>
                <div className="text-gray-800 dark:text-gray-200 break-words">
                  {log.msg}
                </div>
                {Object.keys(log.kv).length > 0 && (
                  <div className="text-gray-600 dark:text-gray-400 mt-1">
                    {JSON.stringify(log.kv, null, 2)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </Card>
  )
}