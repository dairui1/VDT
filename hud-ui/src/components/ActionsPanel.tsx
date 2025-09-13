import React from 'react';

interface ActionEvent {
  ts: number;
  type: 'click' | 'input' | 'navigate' | 'keydown' | 'drag';
  url: string;
  selector?: string;
  value?: string;
  coords?: { x: number; y: number };
  stepId: string;
}

interface ActionsPanelProps {
  actions: ActionEvent[];
}

const ActionsPanel: React.FC<ActionsPanelProps> = ({ actions }) => {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatAction = (action: ActionEvent) => {
    switch (action.type) {
      case 'navigate':
        const url = new URL(action.url);
        return `navigate to ${url.pathname}${url.search}`;
      case 'click':
        if (action.selector) {
          return `click ${action.selector}`;
        } else if (action.coords) {
          return `click at (${action.coords.x}, ${action.coords.y})`;
        }
        return 'click';
      case 'input':
        return `input "${action.value || ''}" into ${action.selector || 'element'}`;
      case 'keydown':
        return `press key ${action.value || 'unknown'}`;
      case 'drag':
        return `drag from ${action.selector || 'unknown'}`;
      default:
        return action.type;
    }
  };

  return (
    <div className="actions-panel">
      <div className="panel-header">
        User Actions ({actions.length})
      </div>
      <div className="actions-list">
        {actions.length === 0 ? (
          <div style={{ color: '#888', fontStyle: 'italic' }}>
            No actions recorded yet
          </div>
        ) : (
          actions.slice().reverse().map((action, index) => (
            <div key={`${action.stepId}-${index}`} className="action-item">
              <div className="action-step">
                {action.stepId}
              </div>
              <div className="action-details">
                <div>{formatAction(action)}</div>
                <div className="event-timestamp">
                  {formatTime(action.ts)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ActionsPanel;