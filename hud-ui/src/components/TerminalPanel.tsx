import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

const TerminalPanel: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selection: '#3e3e3e',
      },
      convertEol: true,
    });

    // Create fit addon
    fitAddon.current = new FitAddon();
    terminal.current.loadAddon(fitAddon.current);

    // Open terminal
    terminal.current.open(terminalRef.current);

    // Fit terminal to container
    const handleResize = () => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Connect to WebSocket for terminal data
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'terminal_output' && terminal.current) {
          terminal.current.write(data.data);
        }
      } catch (error) {
        console.error('Error parsing terminal message:', error);
      }
    };

    // Handle terminal input
    terminal.current.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'pty_input',
          data: data
        }));
      }
    });

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      if (terminal.current) {
        terminal.current.dispose();
      }
    };
  }, []);

  return (
    <div className="terminal-panel">
      <div 
        ref={terminalRef} 
        style={{ 
          width: '100%', 
          height: '100%'
        }} 
      />
    </div>
  );
};

export default TerminalPanel;