import React from 'react';

interface HudStatus {
  dev: { status: 'running' | 'exited'; pid?: number };
  browser: { status: 'ready' | 'closed'; pages: number };
  recent: { actions: number; errors: number; consoleErrors: number };
}

interface StatusBarProps {
  status: HudStatus;
  isConnected: boolean;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, isConnected }) => {
  return (
    <div className="status-bar">
      <div className={`status-item ${isConnected ? 'online' : 'offline'}`}>
        WS: {isConnected ? 'Connected' : 'Disconnected'}
      </div>
      <div className={`status-item ${status.dev.status === 'running' ? 'online' : 'offline'}`}>
        Dev: {status.dev.status} {status.dev.pid ? `(PID: ${status.dev.pid})` : ''}
      </div>
      <div className={`status-item ${status.browser.status === 'ready' ? 'online' : 'offline'}`}>
        Browser: {status.browser.status} ({status.browser.pages} pages)
      </div>
      <div className="status-item">
        Actions: {status.recent.actions}
      </div>
      <div className="status-item">
        Errors: {status.recent.errors}
      </div>
      <div className="status-item">
        Console Errors: {status.recent.consoleErrors}
      </div>
    </div>
  );
};

export default StatusBar;