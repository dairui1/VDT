# Gobang Demo Project

This is a simple Gobang (Five in a Row) game implementation designed to demonstrate VDT debugging capabilities.

## Known Issues

1. **Rendering Alignment Bug**: The `gridToPixel` function in `renderer.js` is missing a 0.5 offset, causing stones to not be properly centered in their cells.

2. **Error Handling**: Some edge cases may not be properly handled.

## Usage

```bash
# Run basic game
npm start

# Run demo with multiple moves
npm run demo
```

## VDT Testing Workflow

1. **Start VDT Session**:
   ```javascript
   vdt_start_session({ repoRoot: './examples/gobang', note: 'Testing rendering bug' })
   ```

2. **Add Logging**:
   ```javascript
   write_log({ 
     sid: '<session-id>', 
     files: ['renderer.js'], 
     anchors: ['gridToPixel'], 
     level: 'debug' 
   })
   ```

3. **Capture Execution**:
   ```javascript
   do_capture({ 
     sid: '<session-id>', 
     shell: { 
       cwd: './examples/gobang', 
       commands: ['npm run demo'] 
     } 
   })
   ```

4. **Analyze Results**:
   ```javascript
   analyze_debug_log({ 
     sid: '<session-id>', 
     focus: { module: 'renderer', func: 'gridToPixel' } 
   })
   ```

Expected outcome: VDT should identify the missing 0.5 offset in the `gridToPixel` function as a potential cause of alignment issues.