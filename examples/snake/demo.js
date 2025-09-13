import { SnakeGame } from './game.js';
import { ConsoleRenderer } from './renderer.js';

class SnakeAI {
    constructor(game) {
        this.game = game;
    }

    // Simple AI that tries to reach food while avoiding collisions
    getNextMove() {
        const validMoves = this.game.getValidMoves();
        if (validMoves.length === 0) return null;

        const head = this.game.snake[0];
        const food = this.game.food;

        // Calculate distance for each valid move
        const moveScores = validMoves.map(move => {
            const newHead = { x: head.x + move.x, y: head.y + move.y };
            const distanceToFood = Math.abs(newHead.x - food.x) + Math.abs(newHead.y - food.y);
            
            // Prefer moves that get closer to food
            let score = -distanceToFood;
            
            // Avoid moves that lead to dead ends
            const futureValidMoves = this.getFutureValidMoves(newHead, move);
            score += futureValidMoves * 10;
            
            return { move, score };
        });

        // Choose the best move
        moveScores.sort((a, b) => b.score - a.score);
        return moveScores[0].move;
    }

    getFutureValidMoves(head, direction) {
        const testSnake = [head, ...this.game.snake.slice(0, -1)];
        const moves = [
            { x: 0, y: -1 },
            { x: 0, y: 1 },
            { x: -1, y: 0 },
            { x: 1, y: 0 }
        ];

        return moves.filter(move => {
            // Can't reverse
            if (direction.x !== 0 && move.x !== 0) return false;
            if (direction.y !== 0 && move.y !== 0) return false;

            const newHead = { x: head.x + move.x, y: head.y + move.y };

            // Check boundaries
            if (newHead.x < 0 || newHead.x >= this.game.width || 
                newHead.y < 0 || newHead.y >= this.game.height) {
                return false;
            }

            // Check collision with snake
            return !testSnake.some(segment => 
                segment.x === newHead.x && segment.y === newHead.y
            );
        }).length;
    }
}

class SnakeDemo {
    constructor() {
        this.game = new SnakeGame(20, 20);
        this.renderer = new ConsoleRenderer();
        this.ai = new SnakeAI(this.game);
        this.stats = {
            gamesPlayed: 0,
            totalScore: 0,
            maxScore: 0,
            avgScore: 0
        };
    }

    async runManualDemo() {
        console.log('🐍 Snake Game - Manual Demo');
        console.log('Use WASD to move, SPACE to pause, R to restart, Q to quit');
        console.log('Starting game...\n');

        this.game.reset();
        this.renderer.render(this.game.getState());

        // Setup input handling for demo
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        return new Promise((resolve) => {
            const gameLoop = setInterval(() => {
                this.game.move();
                this.renderer.render(this.game.getState());
                
                if (this.game.gameOver) {
                    clearInterval(gameLoop);
                    console.log(`\nGame Over! Final Score: ${this.game.score}`);
                    resolve();
                }
            }, 150);

            process.stdin.on('data', (key) => {
                if (key === '\u0003' || key.toLowerCase() === 'q') { // Ctrl+C or Q
                    clearInterval(gameLoop);
                    process.exit();
                }
                
                switch (key.toLowerCase()) {
                    case 'w':
                        this.game.setDirection({ x: 0, y: -1 });
                        break;
                    case 's':
                        this.game.setDirection({ x: 0, y: 1 });
                        break;
                    case 'a':
                        this.game.setDirection({ x: -1, y: 0 });
                        break;
                    case 'd':
                        this.game.setDirection({ x: 1, y: 0 });
                        break;
                    case ' ':
                        this.game.togglePause();
                        break;
                    case 'r':
                        this.game.reset();
                        this.renderer.render(this.game.getState());
                        break;
                }
            });
        });
    }

    async runAIDemo(gamesCount = 5) {
        console.log(`🤖 Snake AI Demo - Playing ${gamesCount} games`);
        console.log('Watching AI play automatically...\n');

        for (let gameNum = 1; gameNum <= gamesCount; gameNum++) {
            console.log(`Game ${gameNum}/${gamesCount}`);
            await this.playAIGame(true); // Show each game
            
            if (gameNum < gamesCount) {
                await this.sleep(1000); // Pause between games
            }
        }

        this.printStats();
    }

    async playAIGame(showGame = false) {
        this.game.reset();
        
        if (showGame) {
            this.renderer.render(this.game.getState());
        }

        return new Promise((resolve) => {
            const gameLoop = setInterval(() => {
                // AI makes a move
                const nextMove = this.ai.getNextMove();
                if (nextMove) {
                    this.game.setDirection(nextMove);
                }

                this.game.move();
                
                if (showGame) {
                    this.renderer.render(this.game.getState());
                }
                
                if (this.game.gameOver) {
                    clearInterval(gameLoop);
                    this.updateStats();
                    
                    if (showGame) {
                        console.log(`Game Over! Score: ${this.game.score}\n`);
                    }
                    
                    resolve();
                }
            }, showGame ? 100 : 10); // Faster when not showing
        });
    }

    async runPerformanceTest() {
        console.log('⚡ Performance Test - Running 100 AI games...');
        
        const startTime = Date.now();
        const testGames = 100;
        
        for (let i = 0; i < testGames; i++) {
            await this.playAIGame(false);
            
            if ((i + 1) % 20 === 0) {
                process.stdout.write(`\rProgress: ${i + 1}/${testGames} games`);
            }
        }
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`\n\nPerformance Results:`);
        console.log(`- Games played: ${testGames}`);
        console.log(`- Total time: ${duration}ms`);
        console.log(`- Average time per game: ${(duration / testGames).toFixed(2)}ms`);
        console.log(`- Games per second: ${(testGames / (duration / 1000)).toFixed(2)}`);
        
        this.printStats();
    }

    async runEdgeCaseTests() {
        console.log('🧪 Edge Case Tests');
        
        // Test 1: Small board
        console.log('\nTest 1: Small board (5x5)');
        const smallGame = new SnakeGame(5, 5);
        const smallAI = new SnakeAI(smallGame);
        let moves = 0;
        
        while (!smallGame.gameOver && moves < 100) {
            const nextMove = smallAI.getNextMove();
            if (nextMove) {
                smallGame.setDirection(nextMove);
            }
            smallGame.move();
            moves++;
        }
        console.log(`Small board result: ${moves} moves, score: ${smallGame.score}`);
        
        // Test 2: Large board
        console.log('\nTest 2: Large board (30x30)');
        const largeGame = new SnakeGame(30, 30);
        const largeAI = new SnakeAI(largeGame);
        moves = 0;
        
        while (!largeGame.gameOver && moves < 1000) {
            const nextMove = largeAI.getNextMove();
            if (nextMove) {
                largeGame.setDirection(nextMove);
            }
            largeGame.move();
            moves++;
        }
        console.log(`Large board result: ${moves} moves, score: ${largeGame.score}`);
        
        // Test 3: Boundary conditions
        console.log('\nTest 3: Boundary collision detection');
        const boundaryGame = new SnakeGame(3, 3);
        boundaryGame.snake = [{ x: 0, y: 0 }];
        boundaryGame.setDirection({ x: -1, y: 0 }); // Should hit left wall
        boundaryGame.move();
        console.log(`Boundary test result: Game over = ${boundaryGame.gameOver}`);
        
        console.log('\nEdge case tests completed!');
    }

    updateStats() {
        this.stats.gamesPlayed++;
        this.stats.totalScore += this.game.score;
        this.stats.maxScore = Math.max(this.stats.maxScore, this.game.score);
        this.stats.avgScore = this.stats.totalScore / this.stats.gamesPlayed;
    }

    printStats() {
        console.log('\n📊 Game Statistics:');
        console.log(`- Games played: ${this.stats.gamesPlayed}`);
        console.log(`- Max score: ${this.stats.maxScore}`);
        console.log(`- Average score: ${this.stats.avgScore.toFixed(2)}`);
        console.log(`- Total score: ${this.stats.totalScore}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const demo = new SnakeDemo();
    
    if (args.includes('--auto')) {
        await demo.runAIDemo(3);
    } else if (args.includes('--ai')) {
        await demo.runAIDemo(10);
    } else if (args.includes('--performance')) {
        await demo.runPerformanceTest();
    } else if (args.includes('--edge-cases')) {
        await demo.runEdgeCaseTests();
    } else {
        console.log('🐍 Snake Game Demo Options:');
        console.log('- node demo.js          : Manual play demo');
        console.log('- node demo.js --auto   : Watch AI play 3 games');
        console.log('- node demo.js --ai     : Watch AI play 10 games');
        console.log('- node demo.js --performance : Performance test (100 games)');
        console.log('- node demo.js --edge-cases  : Edge case testing');
        console.log('\nStarting manual demo...\n');
        
        await demo.runManualDemo();
    }
    
    console.log('\nDemo completed!');
    process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}