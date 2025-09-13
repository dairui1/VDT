import React, { useState } from 'react';

interface ConsoleEvent {
  ts: number;
  type: 'error' | 'warn' | 'log';
  args: any[];
  stack?: string;
}

interface NetworkEvent {
  ts: number;
  phase: 'request' | 'response' | 'failed';
  method: string;
  url: string;
  status?: number;
}

type Event = ConsoleEvent | NetworkEvent;

interface EventsPanelProps {
  events: Event[];
}

const EventsPanel: React.FC<EventsPanelProps> = ({ events }) => {
  const [filter, setFilter] = useState<'all' | 'console' | 'network' | 'errors'>('all');

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const isConsoleEvent = (event: Event): event is ConsoleEvent => {
    return 'args' in event;
  };

  const isNetworkEvent = (event: Event): event is NetworkEvent => {
    return 'method' in event;
  };

  const formatEvent = (event: Event) => {
    if (isConsoleEvent(event)) {
      const argsStr = event.args.map(arg => 
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' ');
      return {
        type: `console.${event.type}`,
        content: argsStr,
        extra: event.stack
      };
    } else if (isNetworkEvent(event)) {
      const url = new URL(event.url);
      return {
        type: `network.${event.phase}`,
        content: `${event.method} ${url.pathname}${url.search}`,
        extra: event.status ? `Status: ${event.status}` : undefined
      };
    }
    return { type: 'unknown', content: 'Unknown event' };
  };

  const filteredEvents = events.filter(event => {
    switch (filter) {
      case 'console':
        return isConsoleEvent(event);
      case 'network':
        return isNetworkEvent(event);
      case 'errors':
        return isConsoleEvent(event) && event.type === 'error';
      default:
        return true;
    }
  });

  return (
    <div className="events-panel">
      <div className="panel-header">
        Console & Network ({events.length})
        <div style={{ marginTop: '8px' }}>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value as any)}
            style={{
              background: '#333',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '12px'
            }}
          >
            <option value="all">All Events</option>
            <option value="console">Console Only</option>
            <option value="network">Network Only</option>
            <option value="errors">Errors Only</option>
          </select>
        </div>
      </div>
      <div className="events-list">
        {filteredEvents.length === 0 ? (
          <div style={{ color: '#888', fontStyle: 'italic' }}>
            No events to display
          </div>
        ) : (
          filteredEvents.slice().reverse().map((event, index) => {
            const formatted = formatEvent(event);
            return (
              <div key={`${event.ts}-${index}`} className="event-item">
                <div className={`event-type ${formatted.type.includes('error') ? 'error' : formatted.type.includes('warn') ? 'warn' : ''}`}>
                  {formatted.type}
                </div>
                <div style={{ marginTop: '4px', wordBreak: 'break-word' }}>
                  {formatted.content}
                </div>
                {formatted.extra && (
                  <div style={{ marginTop: '4px', color: '#888', fontSize: '11px' }}>
                    {formatted.extra}
                  </div>
                )}
                <div className="event-timestamp">
                  {formatTime(event.ts)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default EventsPanel;