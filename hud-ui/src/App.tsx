import React, { useEffect, useState } from 'react';
import TerminalPanel from './components/TerminalPanel';
import ActionsPanel from './components/ActionsPanel';
import EventsPanel from './components/EventsPanel';
import StatusBar from './components/StatusBar';

interface HudStatus {
  dev: { status: 'running' | 'exited'; pid?: number };
  browser: { status: 'ready' | 'closed'; pages: number };
  recent: { actions: number; errors: number; consoleErrors: number };
}

function App() {
  const [status, setStatus] = useState<HudStatus>({
    dev: { status: 'exited' },
    browser: { status: 'closed', pages: 0 },
    recent: { actions: 0, errors: 0, consoleErrors: 0 }
  });
  const [events, setEvents] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to VDT HUD WebSocket');
      
      // Request initial status
      ws.send(JSON.stringify({ type: 'get_status' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'status':
            setStatus(data.data);
            break;
          case 'event':
            setEvents(prev => [...prev.slice(-99), data.data]); // Keep last 100 events
            break;
          case 'action':
            setActions(prev => [...prev.slice(-49), data.data]); // Keep last 50 actions
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from VDT HUD WebSocket');
      
      // Attempt to reconnect after 3 seconds
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      ws.close();
    };
  }, []);

  return (
    <div className="hud-container">
      <TerminalPanel />
      <ActionsPanel actions={actions} />
      <EventsPanel events={events} />
      <StatusBar status={status} isConnected={isConnected} />
    </div>
  );
}

export default App;