import { SnakeGame } from './game.js';
import { ConsoleRenderer, CanvasRenderer } from './renderer.js';

export class GameController {
    constructor(options = {}) {
        this.game = new SnakeGame(options.width, options.height);
        this.gameLoop = null;
        this.speed = options.speed || 150; // ms per frame
        this.isWeb = typeof window !== 'undefined';
        
        if (this.isWeb) {
            this.canvas = options.canvas || document.getElementById('gameCanvas');
            this.renderer = new CanvasRenderer(this.canvas);
            this.setupWebControls();
        } else {
            this.renderer = new ConsoleRenderer();
            this.setupConsoleControls();
        }
    }

    start() {
        this.game.reset();
        this.startGameLoop();
        this.render();
    }

    stop() {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
    }

    restart() {
        this.stop();
        this.start();
    }

    startGameLoop() {
        this.stop();
        this.gameLoop = setInterval(() => {
            this.game.move();
            this.render();
            
            if (this.game.gameOver) {
                this.stop();
            }
        }, this.speed);
    }

    render() {
        this.renderer.render(this.game.getState());
        
        if (this.isWeb) {
            this.updateUI();
        }
    }

    updateUI() {
        const scoreElement = document.getElementById('score');
        const lengthElement = document.getElementById('length');
        const statusElement = document.getElementById('status');
        
        if (scoreElement) scoreElement.textContent = this.game.score;
        if (lengthElement) lengthElement.textContent = this.game.snake.length;
        
        if (statusElement) {
            if (this.game.gameOver) {
                statusElement.textContent = 'Game Over';
                statusElement.className = 'status game-over';
            } else if (this.game.paused) {
                statusElement.textContent = 'Paused';
                statusElement.className = 'status paused';
            } else {
                statusElement.textContent = 'Playing';
                statusElement.className = 'status playing';
            }
        }
    }

    setupWebControls() {
        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e.key);
            e.preventDefault();
        });

        // Touch controls for mobile
        let touchStartX = 0;
        let touchStartY = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        });

        document.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            const minSwipeDistance = 50;

            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (Math.abs(deltaX) > minSwipeDistance) {
                    this.handleKeyPress(deltaX > 0 ? 'ArrowRight' : 'ArrowLeft');
                }
            } else {
                if (Math.abs(deltaY) > minSwipeDistance) {
                    this.handleKeyPress(deltaY > 0 ? 'ArrowDown' : 'ArrowUp');
                }
            }
        });
    }

    setupConsoleControls() {
        if (typeof process !== 'undefined') {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            
            process.stdin.on('data', (key) => {
                if (key === '\u0003') { // Ctrl+C
                    process.exit();
                }
                this.handleKeyPress(key);
            });
        }
    }

    handleKeyPress(key) {
        switch (key.toLowerCase()) {
            case 'w':
            case 'arrowup':
                this.game.setDirection({ x: 0, y: -1 });
                break;
            case 's':
            case 'arrowdown':
                this.game.setDirection({ x: 0, y: 1 });
                break;
            case 'a':
            case 'arrowleft':
                this.game.setDirection({ x: -1, y: 0 });
                break;
            case 'd':
            case 'arrowright':
                this.game.setDirection({ x: 1, y: 0 });
                break;
            case ' ':
                this.game.togglePause();
                if (!this.game.paused && !this.game.gameOver) {
                    this.startGameLoop();
                } else {
                    this.stop();
                }
                this.render();
                break;
            case 'r':
                this.restart();
                break;
        }
    }

    setSpeed(speed) {
        this.speed = speed;
        if (this.gameLoop && !this.game.gameOver && !this.game.paused) {
            this.startGameLoop();
        }
    }
}