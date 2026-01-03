// 游戏配置
const CONFIG = {
    CANVAS_WIDTH: 1200,
    CANVAS_HEIGHT: 600,
    GRAVITY: 0.8,
    JUMP_STRENGTH: -15,
    MOVE_SPEED: 5,
    GROUND_Y: 500,
    ATTACK_RANGE: 80,
    ATTACK_DAMAGE: 10,
    MAX_HEALTH: 100
};

// 游戏状态
let socket = null;
let gameState = {
    players: {},
    myId: null,
    connected: false,
    roomCode: null,
    isHost: false,
    gameRunning: false
};

// 开始界面元素
const startScreen = document.getElementById('start-screen');
const roomControls = document.getElementById('room-controls');
const roomInfo = document.getElementById('room-info');
const roomCodeDisplay = document.getElementById('room-code-display');
const playerCountDisplay = document.getElementById('player-count');
const waitingMessage = document.getElementById('waiting-message');
const startGameBtn = document.getElementById('start-game');
const createRoomBtn = document.getElementById('create-room');
const joinRoomBtn = document.getElementById('join-room');
const roomCodeInput = document.getElementById('room-code');
const gameContainer = document.getElementById('game-container');

// Canvas 设置
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.CANVAS_WIDTH;
canvas.height = CONFIG.CANVAS_HEIGHT;

// 输入状态
const keys = {};
const keyMap = {
    'a': 'left',
    'd': 'right',
    'w': 'jump',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowUp': 'jump',
    ' ': 'attack',
    'j': 'attack'
};

// 事件监听
document.addEventListener('keydown', (e) => {
    const action = keyMap[e.key.toLowerCase()];
    if (action && !keys[action]) {
        keys[action] = true;
        if (socket && gameState.connected) {
            socket.emit('input', { action, pressed: true });
        }
    }
});

function joinRoomFromStartScreen() {
    const code = (roomCodeInput.value || '').trim();
    if (!code) return;
    if (socket && gameState.connected) {
        socket.emit('joinRoom', { roomCode: code });
        updateGameTips('正在加入房间...');
    } else {
        updateGameTips('尚未连接服务器，请稍等...');
    }
}

document.addEventListener('keyup', (e) => {
    const action = keyMap[e.key.toLowerCase()];
    if (action) {
        keys[action] = false;
        if (socket && gameState.connected) {
            socket.emit('input', { action, pressed: false });
        }
    }
});

// 绘制火柴人
function drawStickman(x, y, facing, isAttacking, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing === 'left' ? -1 : 1, 1);
    
    // 身体颜色
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // 头部
    ctx.beginPath();
    ctx.arc(0, -40, 15, 0, Math.PI * 2);
    ctx.stroke();
    
    // 身体
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 15);
    ctx.stroke();
    
    // 手臂
    const armAngle = isAttacking ? -Math.PI / 2 : -Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(Math.cos(armAngle) * 25, -10 + Math.sin(armAngle) * 25);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(Math.cos(-armAngle) * 25, -10 + Math.sin(-armAngle) * 25);
    ctx.stroke();
    
    // 腿部
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(-10, 40);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(0, 15);
    ctx.lineTo(10, 40);
    ctx.stroke();
    
    // 攻击特效
    if (isAttacking) {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(30, -10, 20, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    ctx.restore();
}

// 绘制地面
function drawGround() {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, CONFIG.GROUND_Y, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT - CONFIG.GROUND_Y);
    
    // 地面装饰线
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, CONFIG.GROUND_Y);
    ctx.lineTo(CONFIG.CANVAS_WIDTH, CONFIG.GROUND_Y);
    ctx.stroke();
}

// 更新游戏提示
function updateGameTips(text) {
    const tipsEl = document.getElementById('gameTips');
    if (tipsEl) {
        tipsEl.textContent = text;
    }
}

// 更新UI
function updateUI() {
    const myPlayer = gameState.players[gameState.myId];
    const opponentId = Object.keys(gameState.players).find(id => id !== gameState.myId);
    const opponent = opponentId ? gameState.players[opponentId] : null;
    
    // 玩家信息
    if (myPlayer) {
        document.getElementById('playerInfo').textContent = `玩家 (你) - 位置: ${Math.floor(myPlayer.x)}, ${Math.floor(myPlayer.y)}`;
        const healthPercent = (myPlayer.health / CONFIG.MAX_HEALTH) * 100;
        document.getElementById('playerHealth').style.width = healthPercent + '%';
    }
    
    // 对手信息
    if (opponent) {
        document.getElementById('opponentInfo').textContent = `对手 - 位置: ${Math.floor(opponent.x)}, ${Math.floor(opponent.y)}`;
        const healthPercent = (opponent.health / CONFIG.MAX_HEALTH) * 100;
        document.getElementById('opponentHealth').style.width = healthPercent + '%';
    } else {
        document.getElementById('opponentInfo').textContent = '等待对手...';
        document.getElementById('opponentHealth').style.width = '100%';
    }
    
    // 游戏状态（这部分由socket事件更新，这里只更新玩家信息）
    // 游戏状态UI在socket事件中更新
}

// 游戏循环
function gameLoop() {
    // 清空画布
    ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    
    // 绘制背景
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.CANVAS_HEIGHT);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#98D8C8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    
    // 绘制地面
    drawGround();
    
    // 绘制所有玩家
    Object.values(gameState.players).forEach(player => {
        const isMe = player.id === gameState.myId;
        const color = isMe ? '#4CAF50' : '#FF5722';
        drawStickman(
            player.x,
            player.y,
            player.facing,
            player.isAttacking,
            color
        );
        
        // 绘制名称标签
        ctx.fillStyle = color;
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(isMe ? '你' : '对手', player.x, player.y - 60);
        
        // 绘制生命值条
        const barWidth = 60;
        const barHeight = 6;
        const healthPercent = player.health / CONFIG.MAX_HEALTH;
        
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(player.x - barWidth/2, player.y - 55, barWidth, barHeight);
        
        ctx.fillStyle = healthPercent > 0.5 ? '#4CAF50' : healthPercent > 0.25 ? '#FFC107' : '#F44336';
        ctx.fillRect(player.x - barWidth/2, player.y - 55, barWidth * healthPercent, barHeight);
    });
    
    // 更新UI
    updateUI();
    
    requestAnimationFrame(gameLoop);
}

// Socket.io 连接
function connectToServer() {
    if (socket) {
        socket.disconnect();
    }
    
    // 自动检测服务器地址
    const serverUrl = window.location.origin;
    socket = io(serverUrl);
    
    socket.on('connect', () => {
        console.log('已连接到服务器');
        gameState.connected = true;
        document.getElementById('disconnectBtn').disabled = false;
        document.getElementById('gameStatus').textContent = '已连接';
        updateGameTips('已连接服务器，请创建房间或输入邀请码加入');
    });
    
    socket.on('disconnect', () => {
        console.log('与服务器断开连接');
        gameState.connected = false;
        gameState.players = {};
        document.getElementById('disconnectBtn').disabled = true;
        document.getElementById('inviteCode').style.display = 'none';
        document.getElementById('joinRoomSection').style.display = 'none';
        document.getElementById('createRoomBtn').style.display = 'none';
    });
    
    // 房间创建成功
    socket.on('roomCreated', (data) => {
        console.log('房间创建成功:', data);
        gameState.myId = data.playerId;
        gameState.roomCode = data.roomCode;
        gameState.isHost = true;

        // 开始界面 UI
        roomControls.style.display = 'none';
        roomInfo.style.display = 'block';
        roomCodeDisplay.textContent = data.roomCode;
        playerCountDisplay.textContent = String(data.playerCount);
        waitingMessage.textContent = '等待其他玩家加入...';
        startGameBtn.style.display = 'none';

        document.getElementById('roomCodeDisplay').textContent = data.roomCode;
        document.getElementById('inviteCode').style.display = 'block';
        document.getElementById('joinRoomSection').style.display = 'block';
        document.getElementById('createRoomBtn').style.display = 'none';
        document.getElementById('gameStatus').textContent = '房间已创建';
        document.getElementById('roomInfo').textContent = `房间人数: ${data.playerCount}/${data.maxPlayers}`;
        updateGameTips('房间已创建！分享邀请码给好友一起玩');
    });
    
    // 加入房间成功
    socket.on('roomJoined', (data) => {
        console.log('加入房间成功:', data);
        gameState.myId = data.playerId;
        gameState.roomCode = data.roomCode;
        gameState.isHost = false;

        // 开始界面 UI
        roomControls.style.display = 'none';
        roomInfo.style.display = 'block';
        roomCodeDisplay.textContent = data.roomCode;
        playerCountDisplay.textContent = String(data.playerCount);
        waitingMessage.textContent = '等待房主开始...';
        startGameBtn.style.display = 'none';

        document.getElementById('roomCodeDisplay').textContent = data.roomCode;
        document.getElementById('inviteCode').style.display = 'block';
        document.getElementById('joinRoomSection').style.display = 'none';
        document.getElementById('createRoomBtn').style.display = 'none';
        document.getElementById('gameStatus').textContent = '已加入房间';
        document.getElementById('roomInfo').textContent = `房间人数: ${data.playerCount}/${data.maxPlayers}`;
        updateGameTips('已加入房间！');
    });
    
    socket.on('gameState', (state) => {
        gameState.players = state.players;
    });
    
    socket.on('playerJoined', (data) => {
        console.log('玩家加入:', data);
        document.getElementById('roomInfo').textContent = `房间人数: ${data.playerCount}/${data.maxPlayers}`;

        // 开始界面人数显示
        playerCountDisplay.textContent = String(data.playerCount);

        if (data.playerCount === 2) {
            updateGameTips('对手已加入，游戏即将开始！');
        } else {
            updateGameTips('等待对手加入...');
        }
    });
    
    socket.on('gameStart', () => {
        // 进入游戏
        startScreen.style.display = 'none';
        gameContainer.style.display = 'block';
        gameState.gameRunning = true;
        updateGameTips('游戏开始！使用 WASD 或方向键控制，J键或空格键攻击');
    });
    
    socket.on('roomFull', () => {
        alert('房间已满！最多支持2名玩家。');
    });
    
    socket.on('roomNotFound', () => {
        alert('房间不存在！请检查邀请码是否正确。');
    });
    
    socket.on('playerLeft', (data) => {
        console.log('玩家离开:', data);
        document.getElementById('roomInfo').textContent = `房间人数: ${data.playerCount}/${data.maxPlayers}`;

        // 开始界面人数显示
        playerCountDisplay.textContent = String(data.playerCount);

        if (data.playerCount === 1) {
            updateGameTips('对手已离开，等待新玩家加入...');
        }
    });
    
    socket.on('gameOver', (data) => {
        alert(data.winner === gameState.myId ? '你赢了！' : '你输了！');
        setTimeout(() => {
            socket.emit('restart');
        }, 2000);
    });
}

// 复制邀请码
function copyInviteCode() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.textContent;
        btn.textContent = '已复制！';
        btn.style.background = '#4CAF50';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '#4CAF50';
        }, 2000);
    }).catch(() => {
        // 备用方法
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        const btn = document.getElementById('copyCodeBtn');
        const originalText = btn.textContent;
        btn.textContent = '已复制！';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

// 加入房间
function joinRoom() {
    const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
    if (code && socket && gameState.connected) {
        socket.emit('joinRoom', { roomCode: code });
        updateGameTips('正在加入房间...');
    }
}

// 按钮事件
createRoomBtn.addEventListener('click', () => {
    if (socket && gameState.connected) {
        socket.emit('createRoom');
        updateGameTips('正在创建房间...');
    } else {
        updateGameTips('尚未连接服务器，请稍等...');
    }
});

joinRoomBtn.addEventListener('click', joinRoomFromStartScreen);
roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoomFromStartScreen();
    }
});

document.getElementById('createRoomBtn').addEventListener('click', () => {
    if (socket && gameState.connected) {
        socket.emit('createRoom');
    }
});
document.getElementById('disconnectBtn').addEventListener('click', () => {
    if (socket) {
        socket.disconnect();
    }
});
document.getElementById('copyCodeBtn').addEventListener('click', copyInviteCode);
document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);

// 回车键加入房间
document.getElementById('roomCodeInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinRoom();
    }
});

// 页面加载时自动连接
window.addEventListener('load', () => {
    setTimeout(() => {
        connectToServer();
    }, 500);
});

// 启动游戏循环
gameLoop();

