'use client'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useEffect, useRef, useState } from 'react'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  sessionId: string
  className?: string
}

export function Terminal({ sessionId, className }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Dynamically import xterm modules only on client side
    const loadTerminal = async () => {
      try {
        const { Terminal: XTerm } = await import('@xterm/xterm')
        const { FitAddon } = await import('@xterm/addon-fit')
        
        if (!terminalRef.current) return

        // Initialize terminal
        const term = new XTerm({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          scrollback: 10000,
          smoothScrollDuration: 100,
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5'
          }
        })

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        
        term.open(terminalRef.current)
        fitAddon.fit()

        xtermRef.current = term
        fitAddonRef.current = fitAddon

        // Connect to WebSocket for terminal communication
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${protocol}//${window.location.host}/api/websocket?type=terminal&sessionId=${sessionId}`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('Terminal WebSocket connected')
          setIsConnected(true)
          
          // Send initial resize
          ws.send(JSON.stringify({
            type: 'resize',
            cols: term.cols,
            rows: term.rows
          }))
          
          // Welcome message
          term.write('\x1b[32mVDT Debug Terminal Connected\x1b[0m\r\n')
          term.write('\x1b[90mSession: ' + sessionId + '\x1b[0m\r\n\r\n')
        }

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            
            switch (message.type) {
              case 'data':
                term.write(message.data)
                break
                
              case 'exit':
                term.write(`\r\n\x1b[31mProcess exited with code: ${message.code}\x1b[0m\r\n`)
                setIsConnected(false)
                break
                
              case 'log':
                // Display captured logs in terminal
                const timestamp = new Date(message.timestamp).toLocaleTimeString()
                const levelColor = message.level === 'error' ? '\x1b[31m' : 
                                 message.level === 'warn' ? '\x1b[33m' : '\x1b[36m'
                term.write(`\r\n${levelColor}[${timestamp}] ${message.level.toUpperCase()}\x1b[0m ${message.msg}\r\n`)
                break
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
          }
        }

        ws.onclose = () => {
          console.log('Terminal WebSocket disconnected')
          setIsConnected(false)
          term.write('\r\n\x1b[31mConnection lost\x1b[0m\r\n')
        }

        ws.onerror = (error) => {
          console.error('Terminal WebSocket error:', error)
          setIsConnected(false)
          term.write('\r\n\x1b[31mConnection error\x1b[0m\r\n')
        }

        // Forward terminal input to WebSocket
        term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'data', data }))
          }
        })

        // Handle window resize
        const handleResize = () => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit()
            
            // Send resize to backend
            if (ws.readyState === WebSocket.OPEN && xtermRef.current) {
              ws.send(JSON.stringify({
                type: 'resize',
                cols: xtermRef.current.cols,
                rows: xtermRef.current.rows
              }))
            }
          }
        }
        window.addEventListener('resize', handleResize)

        setIsLoaded(true)

        return () => {
          window.removeEventListener('resize', handleResize)
          if (wsRef.current) {
            wsRef.current.close()
          }
          if (xtermRef.current) {
            xtermRef.current.dispose()
          }
        }
      } catch (error) {
        console.error('Failed to load terminal:', error)
      }
    }

    loadTerminal()
  }, [sessionId])

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50 dark:bg-gray-800">
        <h3 className="text-sm font-medium">Terminal</h3>
        <span className={cn(
          "text-xs px-2 py-0.5 rounded",
          isConnected 
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
        )}>
          {!isLoaded ? 'Loading...' : isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      <div ref={terminalRef} className="flex-1 p-2 bg-[#1e1e1e] overflow-auto" />
    </Card>
  )
}