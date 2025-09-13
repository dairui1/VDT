import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get('url')
  
  if (!targetUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'VDT-Debug-HUD/1.0'
      }
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    let html = await response.text()
    
    // Inject event capture script
    const eventCaptureScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalWarn = console.warn;
          const originalError = console.error;
          
          // Capture console logs
          console.log = function(...args) {
            parent.postMessage({
              type: 'browser-event',
              data: {
                id: Date.now() + '-log-' + Math.random(),
                type: 'console',
                level: 'log',
                timestamp: new Date().toISOString(),
                args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)),
                url: window.location.href,
                element: { tagName: '', id: '', className: '', text: '', href: '', src: '' },
                details: { args }
              }
            }, '*');
            return originalLog.apply(console, args);
          };
          
          console.warn = function(...args) {
            parent.postMessage({
              type: 'browser-event',
              data: {
                id: Date.now() + '-warn-' + Math.random(),
                type: 'console',
                level: 'warn',
                timestamp: new Date().toISOString(),
                args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)),
                url: window.location.href,
                element: { tagName: '', id: '', className: '', text: '', href: '', src: '' },
                details: { args }
              }
            }, '*');
            return originalWarn.apply(console, args);
          };
          
          console.error = function(...args) {
            parent.postMessage({
              type: 'browser-event',
              data: {
                id: Date.now() + '-error-' + Math.random(),
                type: 'console',
                level: 'error',
                timestamp: new Date().toISOString(),
                args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)),
                stack: (new Error()).stack,
                url: window.location.href,
                element: { tagName: '', id: '', className: '', text: '', href: '', src: '' },
                details: { args }
              }
            }, '*');
            return originalError.apply(console, args);
          };
          
          // Capture clicks
          document.addEventListener('click', function(e) {
            parent.postMessage({
              type: 'browser-event',
              data: {
                id: Date.now() + '-click-' + Math.random(),
                type: 'click',
                timestamp: new Date().toISOString(),
                url: window.location.href,
                element: {
                  tagName: e.target.tagName || '',
                  id: e.target.id || '',
                  className: e.target.className || '',
                  text: e.target.textContent || '',
                  href: e.target.href || '',
                  src: e.target.src || ''
                },
                details: {
                  x: e.clientX,
                  y: e.clientY,
                  button: e.button
                }
              }
            }, '*');
          });
          
          // Capture form inputs
          document.addEventListener('input', function(e) {
            if (e.target.type === 'password') return; // Don't capture passwords
            
            parent.postMessage({
              type: 'browser-event',
              data: {
                id: Date.now() + '-input-' + Math.random(),
                type: 'input',
                timestamp: new Date().toISOString(),
                url: window.location.href,
                element: {
                  tagName: e.target.tagName || '',
                  id: e.target.id || '',
                  className: e.target.className || '',
                  text: e.target.value || '',
                  href: '',
                  src: ''
                },
                details: {
                  value: e.target.value,
                  inputType: e.target.type
                }
              }
            }, '*');
          });
          
          // Capture page navigation
          let currentUrl = window.location.href;
          const observer = new MutationObserver(function() {
            if (window.location.href !== currentUrl) {
              currentUrl = window.location.href;
              parent.postMessage({
                type: 'browser-event',
                data: {
                  id: Date.now() + '-navigate-' + Math.random(),
                  type: 'navigate',
                  timestamp: new Date().toISOString(),
                  url: currentUrl,
                  element: { tagName: '', id: '', className: '', text: '', href: '', src: '' },
                  details: { newUrl: currentUrl }
                }
              }, '*');
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
        })();
      </script>
    `;
    
    // Inject the script before the closing head tag, or before closing body if no head
    if (html.includes('</head>')) {
      html = html.replace('</head>', eventCaptureScript + '</head>')
    } else if (html.includes('</body>')) {
      html = html.replace('</body>', eventCaptureScript + '</body>')
    } else {
      html += eventCaptureScript
    }
    
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'X-Proxied-By': 'VDT-Debug-HUD'
      }
    })
  } catch (error) {
    console.error('Proxy error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}