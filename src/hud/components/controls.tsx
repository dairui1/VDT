'use client'

import { useState } from 'react'
import { Play, Square, Download, RotateCcw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ControlsProps {
  sessionId: string
  entryUrl: string
}

export function Controls({ sessionId, entryUrl }: ControlsProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const startRecording = async () => {
    try {
      const response = await fetch('/api/recording/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          entryUrl
        })
      })
      
      const result = await response.json()
      if (result.success) {
        setIsRecording(true)
        setRecordingId(result.recordingId)
      }
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  const stopRecording = async () => {
    if (!recordingId) return
    
    try {
      const response = await fetch('/api/recording/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          recordingId
        })
      })
      
      const result = await response.json()
      if (result.success) {
        setIsRecording(false)
        setRecordingId(null)
      }
    } catch (error) {
      console.error('Failed to stop recording:', error)
    }
  }

  const exportLogs = async () => {
    try {
      const response = await fetch(`/api/export/logs?sessionId=${sessionId}`)
      const blob = await response.blob()
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `vdt-logs-${sessionId}-${Date.now()}.ndjson`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Failed to export logs:', error)
    }
  }

  const replay = async () => {
    try {
      const response = await fetch('/api/replay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          entryUrl
        })
      })
      
      const result = await response.json()
      if (result.success) {
        console.log('Replay started')
      }
    } catch (error) {
      console.error('Failed to start replay:', error)
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">VDT Debug HUD</h1>
        <span className="text-sm text-gray-500">Session: {sessionId}</span>
      </div>
      
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">
          Target: <span className="font-mono text-blue-600">{entryUrl}</span>
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
          >
            <Play className="w-4 h-4" />
            Record
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-500 text-white rounded-md hover:bg-gray-600 text-sm"
          >
            <Square className="w-4 h-4" />
            Stop
          </button>
        )}
        
        <button
          onClick={exportLogs}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        
        <button
          onClick={replay}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Replay
        </button>
        
        <button className="p-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md">
          <Settings className="w-4 h-4" />
        </button>
        
        {isRecording && (
          <div className="flex items-center gap-1 text-red-500">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs">REC</span>
          </div>
        )}
      </div>
    </div>
  )
}