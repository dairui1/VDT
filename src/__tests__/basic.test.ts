// Simple test to verify the build works
import { LogProcessor } from '../utils/logs.js';

describe('Basic VDT Tests', () => {
  test('LogProcessor should create log events', () => {
    const event = LogProcessor.createLogEvent('test.js', 'func', 'message');
    expect(event.module).toBe('test.js');
    expect(event.func).toBe('func');
    expect(event.msg).toBe('message');
  });

  test('LogProcessor should redact sensitive data', () => {
    const result = LogProcessor.redactSensitive('email: user@test.com');
    expect(result).toContain('***');
  });
});