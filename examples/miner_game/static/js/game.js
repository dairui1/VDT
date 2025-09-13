class GoldMinerGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameConfig = null;
        this.currentLevel = 1;
        this.score = 0;
        this.targetScore = 500;
        this.timeRemaining = 60;
        this.gameRunning = false;
        this.gamePaused = false;
        
        // Claw properties
        this.claw = {
            x: this.canvas.width / 2,
            y: 60,
            angle: 0,
            length: 40,
            extending: false,
            retracting: false,
            speed: 5,
            maxLength: 500,
            swingSpeed: 0.02,
            swingDirection: 1,
            grabbedObject: null
        };
        
        // Game objects
        this.objects = [];
        this.particles = [];
        
        // Animation
        this.animationId = null;
        this.lastTime = 0;
        
        this.init();
    }
    
    async init() {
        console.log('minergame: Initializing game...');
        // Load game configuration
        const response = await fetch('/api/game_config');
        this.gameConfig = await response.json();
        console.log('minergame: Game config loaded', this.gameConfig);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize game
        this.loadLevel(1);
        this.draw();
    }
    
    setupEventListeners() {
        // Game controls
        document.getElementById('startBtn').addEventListener('click', () => this.startGame());
        document.getElementById('pauseBtn').addEventListener('click', () => this.togglePause());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetGame());
        
        // Modal buttons
        document.getElementById('nextLevelBtn').addEventListener('click', () => this.nextLevel());
        document.getElementById('retryBtn').addEventListener('click', () => this.retryLevel());
        document.getElementById('menuBtn').addEventListener('click', () => this.showMenu());
        
        // Game input
        this.canvas.addEventListener('click', () => this.launchClaw());
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.launchClaw();
            }
        });
    }
    
    loadLevel(levelNum) {
        console.log(`minergame: Loading level ${levelNum}`);
        this.currentLevel = levelNum;
        const levelConfig = this.gameConfig.levels[levelNum - 1];
        
        if (!levelConfig) {
            this.showGameComplete();
            return;
        }
        
        this.targetScore = levelConfig.target_score;
        this.timeRemaining = levelConfig.time;
        this.objects = [];
        
        // Update UI
        document.getElementById('level').textContent = levelNum;
        document.getElementById('target').textContent = this.targetScore;
        document.getElementById('timer').textContent = this.timeRemaining;
        
        // Generate objects
        levelConfig.objects.forEach(objConfig => {
            for (let i = 0; i < objConfig.count; i++) {
                this.objects.push(this.createObject(objConfig));
            }
        });
        console.log(`minergame: Level ${levelNum} loaded with ${this.objects.length} objects`);
    }
    
    createObject(config) {
        const obj = {
            type: config.type,
            value: config.value === 'random' ? Math.floor(Math.random() * 300) + 100 : config.value,
            weight: config.weight,
            x: Math.random() * (this.canvas.width - 100) + 50,
            y: Math.random() * (this.canvas.height - 300) + 200,
            width: this.getObjectSize(config.type).width,
            height: this.getObjectSize(config.type).height,
            grabbed: false,
            visible: true
        };
        
        // Ensure objects don't overlap too much
        let attempts = 0;
        while (attempts < 50 && this.checkObjectOverlap(obj)) {
            obj.x = Math.random() * (this.canvas.width - 100) + 50;
            obj.y = Math.random() * (this.canvas.height - 300) + 200;
            attempts++;
        }
        
        return obj;
    }
    
    getObjectSize(type) {
        const sizes = {
            'gold_small': { width: 30, height: 30 },
            'gold_medium': { width: 45, height: 45 },
            'gold_large': { width: 60, height: 60 },
            'rock': { width: 50, height: 50 },
            'diamond': { width: 25, height: 25 },
            'mystery_bag': { width: 40, height: 40 },
            'tnt': { width: 35, height: 35 }
        };
        return sizes[type] || { width: 40, height: 40 };
    }
    
    checkObjectOverlap(newObj) {
        for (let obj of this.objects) {
            if (obj === newObj) continue;
            
            const dx = newObj.x - obj.x;
            const dy = newObj.y - obj.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = (newObj.width + obj.width) / 2;
            
            if (distance < minDistance) {
                return true;
            }
        }
        return false;
    }
    
    startGame() {
        if (this.gameRunning) return;
        
        console.log('minergame: Starting game');
        this.gameRunning = true;
        this.gamePaused = false;
        this.lastTime = performance.now();
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        
        // Start timer
        this.startTimer();
        
        // Start game loop
        this.gameLoop();
    }
    
    togglePause() {
        this.gamePaused = !this.gamePaused;
        document.getElementById('pauseBtn').textContent = this.gamePaused ? '继续' : '暂停';
        
        if (!this.gamePaused) {
            this.gameLoop();
        }
    }
    
    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        this.timerInterval = setInterval(() => {
            if (!this.gamePaused && this.gameRunning) {
                this.timeRemaining--;
                document.getElementById('timer').textContent = this.timeRemaining;
                
                if (this.timeRemaining <= 0) {
                    this.endLevel();
                }
            }
        }, 1000);
    }
    
    launchClaw() {
        if (!this.gameRunning || this.gamePaused || this.claw.extending || this.claw.retracting) {
            console.log('minergame: Cannot launch claw - game not running or claw busy');
            return;
        }
        
        console.log('minergame: Launching claw at angle:', this.claw.angle);
        this.claw.extending = true;
    }
    
    updateClaw(deltaTime) {
        // Swing claw when idle
        if (!this.claw.extending && !this.claw.retracting) {
            this.claw.angle += this.claw.swingSpeed * this.claw.swingDirection;
            
            if (Math.abs(this.claw.angle) > Math.PI / 4) {
                this.claw.swingDirection *= -1;
            }
        }
        
        // Extend claw
        if (this.claw.extending) {
            this.claw.length += this.claw.speed;
            
            // Check collision with objects
            const clawTip = this.getClawTip();
            for (let obj of this.objects) {
                if (!obj.visible || obj.grabbed) continue;
                
                if (this.checkClawCollision(clawTip, obj)) {
                    console.log(`minergame: Grabbed ${obj.type} worth ${obj.value} points`);
                    this.claw.grabbedObject = obj;
                    obj.grabbed = true;
                    this.claw.extending = false;
                    this.claw.retracting = true;
                    
                    // Adjust retract speed based on weight
                    this.claw.speed = Math.max(2, 5 - obj.weight);
                    console.log(`minergame: Retract speed adjusted to ${this.claw.speed} based on weight ${obj.weight}`);
                    break;
                }
            }
            
            // Check if claw reached max length or canvas boundary
            if (this.claw.length >= this.claw.maxLength || 
                clawTip.y >= this.canvas.height - 10 ||
                clawTip.x <= 10 || clawTip.x >= this.canvas.width - 10) {
                this.claw.extending = false;
                this.claw.retracting = true;
            }
        }
        
        // Retract claw
        if (this.claw.retracting) {
            this.claw.length -= this.claw.speed;
            
            if (this.claw.grabbedObject) {
                // Move grabbed object with claw
                const clawTip = this.getClawTip();
                this.claw.grabbedObject.x = clawTip.x;
                this.claw.grabbedObject.y = clawTip.y;
            }
            
            if (this.claw.length <= 40) {
                this.claw.length = 40;
                this.claw.retracting = false;
                this.claw.speed = 5; // Reset speed
                
                // Process grabbed object
                if (this.claw.grabbedObject) {
                    this.processGrabbedObject();
                }
            }
        }
    }
    
    getClawTip() {
        return {
            x: this.claw.x + Math.sin(this.claw.angle) * this.claw.length,
            y: this.claw.y + Math.cos(this.claw.angle) * this.claw.length
        };
    }
    
    checkClawCollision(clawTip, obj) {
        return clawTip.x >= obj.x - obj.width / 2 &&
               clawTip.x <= obj.x + obj.width / 2 &&
               clawTip.y >= obj.y - obj.height / 2 &&
               clawTip.y <= obj.y + obj.height / 2;
    }
    
    processGrabbedObject() {
        const obj = this.claw.grabbedObject;
        console.log(`minergame: Processing grabbed object: ${obj.type}`);
        
        if (obj.type === 'tnt') {
            // TNT explosion effect
            console.log('minergame: TNT exploded! Score penalty:', obj.value);
            this.createExplosion(obj.x, obj.y);
            this.score = Math.max(0, this.score + obj.value);
        } else {
            this.score += obj.value;
            console.log(`minergame: Score increased by ${obj.value}. Total score: ${this.score}`);
            this.createScorePopup(obj.x, obj.y, obj.value);
        }
        
        obj.visible = false;
        this.claw.grabbedObject = null;
        
        // Update score display
        document.getElementById('score').textContent = this.score;
        
        // Check if all valuable objects are collected
        const remainingValuables = this.objects.filter(o => o.visible && o.value > 0);
        if (remainingValuables.length === 0) {
            this.endLevel();
        }
    }
    
    createScorePopup(x, y, value) {
        this.particles.push({
            x: x,
            y: y,
            text: (value > 0 ? '+' : '') + value,
            color: value > 0 ? '#FFD700' : '#FF0000',
            life: 60,
            vy: -2
        });
    }
    
    createExplosion(x, y) {
        for (let i = 0; i < 20; i++) {
            this.particles.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                color: `hsl(${Math.random() * 60}, 100%, 50%)`,
                life: 30,
                size: Math.random() * 5 + 2
            });
        }
    }
    
    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life--;
            
            if (p.vy !== undefined) p.y += p.vy;
            if (p.vx !== undefined) p.x += p.vx;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }
    
    endLevel() {
        console.log(`minergame: Level ended. Final score: ${this.score}, Target: ${this.targetScore}`);
        this.gameRunning = false;
        clearInterval(this.timerInterval);
        
        // Update high score
        fetch('/api/update_score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score: this.score })
        }).then(res => res.json()).then(data => {
            document.getElementById('highScore').textContent = data.high_score;
        });
        
        // Show results
        const modal = document.getElementById('gameOverModal');
        const title = document.getElementById('gameOverTitle');
        const message = document.getElementById('gameOverMessage');
        const nextBtn = document.getElementById('nextLevelBtn');
        
        if (this.score >= this.targetScore) {
            console.log('minergame: Level completed successfully!');
            title.textContent = '关卡完成！';
            message.textContent = `恭喜！你获得了 ${this.score} 分！`;
            nextBtn.style.display = 'inline-block';
        } else {
            console.log('minergame: Level failed - score too low');
            title.textContent = '游戏结束';
            message.textContent = `你获得了 ${this.score} 分，目标是 ${this.targetScore} 分`;
            nextBtn.style.display = 'none';
        }
        
        modal.style.display = 'flex';
    }
    
    nextLevel() {
        console.log(`minergame: Moving to next level: ${this.currentLevel + 1}`);
        document.getElementById('gameOverModal').style.display = 'none';
        this.score = 0;
        document.getElementById('score').textContent = '0';
        this.loadLevel(this.currentLevel + 1);
        this.resetClawPosition();
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
    }
    
    retryLevel() {
        document.getElementById('gameOverModal').style.display = 'none';
        this.resetGame();
    }
    
    showMenu() {
        document.getElementById('gameOverModal').style.display = 'none';
        this.resetGame();
    }
    
    resetGame() {
        console.log('minergame: Resetting game');
        this.gameRunning = false;
        this.gamePaused = false;
        clearInterval(this.timerInterval);
        
        this.score = 0;
        document.getElementById('score').textContent = '0';
        
        this.loadLevel(this.currentLevel);
        this.resetClawPosition();
        
        document.getElementById('startBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('pauseBtn').textContent = '暂停';
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        this.draw();
    }
    
    resetClawPosition() {
        this.claw.angle = 0;
        this.claw.length = 40;
        this.claw.extending = false;
        this.claw.retracting = false;
        this.claw.grabbedObject = null;
        this.claw.swingDirection = 1;
    }
    
    showGameComplete() {
        const modal = document.getElementById('gameOverModal');
        document.getElementById('gameOverTitle').textContent = '游戏通关！';
        document.getElementById('gameOverMessage').textContent = `恭喜你完成了所有关卡！总分：${this.score}`;
        document.getElementById('nextLevelBtn').style.display = 'none';
        modal.style.display = 'flex';
    }
    
    gameLoop() {
        if (!this.gameRunning || this.gamePaused) return;
        
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        this.updateClaw(deltaTime);
        this.updateParticles();
        this.draw();
        
        this.animationId = requestAnimationFrame(() => this.gameLoop());
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, this.canvas.width, 150);
        
        this.ctx.fillStyle = '#8B7355';
        this.ctx.fillRect(0, 150, this.canvas.width, this.canvas.height - 150);
        
        // Draw underground line
        this.ctx.strokeStyle = '#654321';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 150);
        this.ctx.lineTo(this.canvas.width, 150);
        this.ctx.stroke();
        
        // Draw objects
        for (let obj of this.objects) {
            if (!obj.visible) continue;
            this.drawObject(obj);
        }
        
        // Draw claw
        this.drawClaw();
        
        // Draw particles
        for (let p of this.particles) {
            if (p.text) {
                this.ctx.fillStyle = p.color;
                this.ctx.font = 'bold 20px Arial';
                this.ctx.globalAlpha = p.life / 60;
                this.ctx.fillText(p.text, p.x, p.y);
                this.ctx.globalAlpha = 1;
            } else {
                this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = p.life / 30;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
            }
        }
    }
    
    drawObject(obj) {
        const colors = {
            'gold_small': '#FFD700',
            'gold_medium': '#FFD700',
            'gold_large': '#FFD700',
            'rock': '#696969',
            'diamond': '#00CED1',
            'mystery_bag': '#8B4513',
            'tnt': '#FF0000'
        };
        
        this.ctx.fillStyle = colors[obj.type] || '#888888';
        
        if (obj.type === 'diamond') {
            // Draw diamond shape
            this.ctx.beginPath();
            this.ctx.moveTo(obj.x, obj.y - obj.height / 2);
            this.ctx.lineTo(obj.x + obj.width / 2, obj.y);
            this.ctx.lineTo(obj.x, obj.y + obj.height / 2);
            this.ctx.lineTo(obj.x - obj.width / 2, obj.y);
            this.ctx.closePath();
            this.ctx.fill();
        } else if (obj.type === 'mystery_bag') {
            // Draw bag shape
            this.ctx.fillRect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
            this.ctx.fillStyle = '#FFD700';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('?', obj.x, obj.y + 5);
            this.ctx.textAlign = 'left';
        } else if (obj.type === 'tnt') {
            // Draw TNT
            this.ctx.fillRect(obj.x - obj.width / 2, obj.y - obj.height / 2, obj.width, obj.height);
            this.ctx.fillStyle = '#FFFFFF';
            this.ctx.font = 'bold 14px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('TNT', obj.x, obj.y + 5);
            this.ctx.textAlign = 'left';
        } else if (obj.type.includes('gold')) {
            // Draw gold nugget
            this.ctx.beginPath();
            this.ctx.arc(obj.x, obj.y, obj.width / 2, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Add shine effect
            this.ctx.fillStyle = '#FFFF99';
            this.ctx.beginPath();
            this.ctx.arc(obj.x - obj.width / 4, obj.y - obj.height / 4, obj.width / 6, 0, Math.PI * 2);
            this.ctx.fill();
        } else {
            // Draw rock
            this.ctx.beginPath();
            this.ctx.arc(obj.x, obj.y, obj.width / 2, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    drawClaw() {
        const clawTip = this.getClawTip();
        
        // Draw rope
        this.ctx.strokeStyle = '#8B4513';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.claw.x, this.claw.y);
        this.ctx.lineTo(clawTip.x, clawTip.y);
        this.ctx.stroke();
        
        // Draw claw hook
        this.ctx.fillStyle = '#696969';
        this.ctx.beginPath();
        this.ctx.arc(clawTip.x, clawTip.y, 8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw claw arms
        this.ctx.strokeStyle = '#696969';
        this.ctx.lineWidth = 3;
        
        // Left arm
        this.ctx.beginPath();
        this.ctx.moveTo(clawTip.x, clawTip.y);
        this.ctx.lineTo(clawTip.x - 10, clawTip.y + 10);
        this.ctx.stroke();
        
        // Right arm
        this.ctx.beginPath();
        this.ctx.moveTo(clawTip.x, clawTip.y);
        this.ctx.lineTo(clawTip.x + 10, clawTip.y + 10);
        this.ctx.stroke();
        
        // Draw winch
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(this.claw.x - 20, this.claw.y - 10, 40, 20);
    }
}

// Initialize game when page loads
window.addEventListener('DOMContentLoaded', () => {
    console.log('minergame: Page loaded, creating game instance');
    const game = new GoldMinerGame();
    console.log('minergame: Game instance created');
});