#!/usr/bin/env node

import { VDTServer } from './dist/server.js';

console.log('🚀 启动 VDT Mock 测试 - 固定 URL: http://localhost:3950/?starthtml=http%3A%2F%2Flocalhost:5010');

// Mock 工具来绕过会话检查
class MockCaptureRunTool {
  constructor() {
    this.hudManager = null;
  }

  async execute(params) {
    try {
      console.log('📝 Mock: 跳过会话检查，直接启动 HUD');
      
      // 固定的 HUD 配置
      const fixedParams = {
        sid: 'mock-session-' + Date.now(),
        mode: 'web',
        web: {
          entryUrl: 'http://localhost:5010', // 固定的目标 URL
          actions: true,
          console: true, 
          network: true
        },
        shell: {
          cwd: process.cwd(),
          commands: ['echo "Mock dev server running"']
        },
        openHud: true
      };

      console.log('🎯 正在启动 HUD，目标 URL:', fixedParams.web.entryUrl);
      
      // 动态导入 HudManager
      const { HudManager } = await import('./dist/utils/hud.js');
      const hudManager = new HudManager();
      
      // 启动 HUD
      const hudResult = await hudManager.startHud({
        sid: fixedParams.sid,
        dev: { 
          cmd: fixedParams.shell.commands[0], 
          cwd: fixedParams.shell.cwd
        },
        browse: { 
          entryUrl: fixedParams.web.entryUrl,
          autoOpen: true 
        },
        capture: {
          screenshot: { mode: 'onAction' },
          network: 'summary',
          redact: undefined
        }
      }, './mock-session-dir');

      const expectedHudUrl = `http://localhost:3950/?starthtml=${encodeURIComponent(fixedParams.web.entryUrl)}`;
      
      console.log('✅ Mock HUD 启动成功!');
      console.log('🌐 HUD URL:', expectedHudUrl);
      console.log('🎯 目标网站:', fixedParams.web.entryUrl);
      console.log('');
      console.log('📋 使用说明:');
      console.log('- HUD 将在浏览器中自动打开');
      console.log('- 左侧面板显示开发工具信息');
      console.log('- 右侧面板显示目标网站内容');
      console.log('- 所有交互都会被记录');
      
      return {
        isError: false,
        content: {
          hud: {
            url: expectedHudUrl,
            targetUrl: fixedParams.web.entryUrl,
            mock: true
          }
        }
      };

    } catch (error) {
      console.error('❌ Mock 启动失败:', error.message);
      console.log('');
      console.log('🔧 可能的解决方案:');
      console.log('1. 确保端口 3950 可用');
      console.log('2. 检查目标服务 http://localhost:5010 是否运行');
      console.log('3. 确保依赖已安装: npm install');
      
      return {
        isError: true,
        message: error.message,
        hint: 'Check if ports 3950 and 5010 are available and services are running'
      };
    }
  }
}

async function runMockTest() {
  try {
    console.log('🔧 初始化 Mock 工具...');
    const mockTool = new MockCaptureRunTool();
    
    console.log('🚀 执行 Mock 测试...');
    const result = await mockTool.execute({
      mode: 'web',
      openHud: true
    });
    
    if (result.isError) {
      console.error('测试失败:', result.message);
    } else {
      console.log('🎉 测试完成!');
      console.log('现在可以在浏览器中访问 HUD 了。');
    }
    
  } catch (error) {
    console.error('💥 Mock 测试异常:', error);
  }
}

runMockTest();