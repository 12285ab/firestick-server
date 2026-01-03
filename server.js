const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
  console.log('✅ 用户已连接');

  socket.on('message', (data) => {
    io.emit('message', data); // 广播给所有人
  });

  socket.on('disconnect', () => {
    console.log('❌ 用户断开');
  });
});

// 关键：使用 Render 提供的 PORT 环境变量
const PORT = process.env.PORT || 3000;

// 关键：监听 0.0.0.0（允许外网访问）
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 服务运行在端口 ${PORT}`);
});

// 游戏配置
const CONFIG = {
    GRAVITY: 0.8,
    JUMP_STRENGTH: -15,
    MOVE_SPEED: 5,
    GROUND_Y: 500,
    ATTACK_RANGE: 80,
    ATTACK_DAMAGE: 10,
    MAX_HEALTH: 100,
    MAX_PLAYERS: 2
};

// 房间管理
const rooms = new Map(); // roomCode -> Room

// 生成4位数字邀请码
function generateRoomCode() {
    // 生成4位数字
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// 房间类
class Room {
    constructor(code) {
        this.code = code;
        this.players = {};
        this.gameRunning = false;
        this.createdAt = Date.now();
    }

    addPlayer(socket, playerId) {
        this.players[playerId] = new Player(playerId, this);
        socket.join(this.code);

        // 如果至少有1个玩家，允许游戏运行（单人也可以进入）
        if (Object.keys(this.players).length >= 1) {
            this.gameRunning = true;
        }

        // 如果房间满了，通知所有玩家
        if (Object.keys(this.players).length === CONFIG.MAX_PLAYERS) {
            io.to(this.code).emit('gameStart');
        }

        return this.players[playerId];
    }

    removePlayer(playerId) {
        delete this.players[playerId];
        if (Object.keys(this.players).length === 0) {
            this.gameRunning = false;
        }
    }

    getPlayerCount() {
        return Object.keys(this.players).length;
    }
}

// 静态文件服务
app.use(express.static(path.join(__dirname)));

// 玩家类
class Player {
    constructor(id, room) {
        this.id = id;
        this.room = room;
        this.x = id === 'player1' ? 200 : 1000;
        this.y = CONFIG.GROUND_Y;
        this.velocityX = 0;
        this.velocityY = 0;
        this.facing = id === 'player1' ? 'right' : 'left';
        this.health = CONFIG.MAX_HEALTH;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.onGround = true;
        this.inputs = {
            left: false,
            right: false,
            jump: false,
            attack: false
        };
    }

    update() {
        // 处理移动
        this.velocityX = 0;
        if (this.inputs.left) {
            this.velocityX = -CONFIG.MOVE_SPEED;
            this.facing = 'left';
        }
        if (this.inputs.right) {
            this.velocityX = CONFIG.MOVE_SPEED;
            this.facing = 'right';
        }

        // 处理跳跃
        if (this.inputs.jump && this.onGround) {
            this.velocityY = CONFIG.JUMP_STRENGTH;
            this.onGround = false;
        }

        // 应用重力
        if (!this.onGround) {
            this.velocityY += CONFIG.GRAVITY;
        }

        // 更新位置
        this.x += this.velocityX;
        this.y += this.velocityY;

        // 地面碰撞
        if (this.y >= CONFIG.GROUND_Y) {
            this.y = CONFIG.GROUND_Y;
            this.velocityY = 0;
            this.onGround = true;
        }

        // 边界限制
        this.x = Math.max(50, Math.min(1150, this.x));

        // 处理攻击
        if (this.inputs.attack && this.attackCooldown <= 0) {
            this.isAttacking = true;
            this.attackCooldown = 30; // 30帧冷却

            // 检测攻击碰撞
            this.checkAttack();
        } else {
            this.isAttacking = false;
        }

        // 更新攻击冷却
        if (this.attackCooldown > 0) {
            this.attackCooldown--;
        }
    }

    checkAttack() {
        if (!this.room) return;
        const otherPlayers = Object.values(this.room.players).filter(p => p.id !== this.id);

        otherPlayers.forEach(other => {
            const distance = Math.abs(this.x - other.x);
            const inRange = distance < CONFIG.ATTACK_RANGE;
            const facingCorrect = (this.facing === 'right' && other.x > this.x) ||
                (this.facing === 'left' && other.x < this.x);

            if (inRange && facingCorrect) {
                other.health = Math.max(0, other.health - CONFIG.ATTACK_DAMAGE);

                // 击退效果
                const knockback = this.facing === 'right' ? 20 : -20;
                other.x += knockback;
                other.x = Math.max(50, Math.min(1150, other.x));

                // 检查游戏结束
                if (other.health <= 0) {
                    io.to(this.room.code).emit('gameOver', { winner: this.id });
                    this.room.gameRunning = false;
                }
            }
        });
    }

    getState() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            facing: this.facing,
            health: this.health,
            isAttacking: this.isAttacking
        };
    }
}

// Socket.io 连接处理
io.on('connection', (socket) => {
    console.log('新玩家连接:', socket.id);

    // 创建新房间
    socket.on('createRoom', (callback) => {
        let roomCode;
        do {
            roomCode = generateRoomCode();
        } while (rooms.has(roomCode));

        const room = new Room(roomCode);
        rooms.set(roomCode, room);
        currentRoom = room;

        playerId = `player1`;
        player = room.addPlayer(socket, playerId);
        socket.playerId = playerId;
        socket.roomCode = roomCode;

        console.log(`创建房间: ${roomCode}, 玩家: ${playerId}`);

        socket.emit('roomCreated', {
            roomCode,
            playerId,
            playerCount: room.getPlayerCount(),
            maxPlayers: CONFIG.MAX_PLAYERS
        });

        // 如果只有1个玩家，也允许进入游戏
        if (room.getPlayerCount() === 1) {
            socket.emit('gameStart');
        }
    });

    // 加入房间
    socket.on('joinRoom', (data) => {
        const { roomCode } = data;
        const room = rooms.get(roomCode);

        if (!room) {
            socket.emit('roomNotFound');
            return;
        }

        if (room.getPlayerCount() >= CONFIG.MAX_PLAYERS) {
            socket.emit('roomFull');
            return;
        }

        currentRoom = room;
        playerId = `player${room.getPlayerCount() + 1}`;
        player = room.addPlayer(socket, playerId);
        socket.playerId = playerId;
        socket.roomCode = roomCode;

        console.log(`玩家 ${playerId} 加入房间: ${roomCode}`);

        socket.emit('roomJoined', {
            roomCode,
            playerId,
            playerCount: room.getPlayerCount(),
            maxPlayers: CONFIG.MAX_PLAYERS
        });

        // 通知房间内所有玩家
        io.to(roomCode).emit('playerJoined', {
            playerId,
            playerCount: room.getPlayerCount(),
            maxPlayers: CONFIG.MAX_PLAYERS
        });

        // 如果房间满了，开始游戏
        if (room.getPlayerCount() === CONFIG.MAX_PLAYERS) {
            io.to(roomCode).emit('gameStart');
        }
    });

    // 处理输入
    socket.on('input', (data) => {
        if (player && currentRoom && currentRoom.gameRunning) {
            const { action, pressed } = data;
            if (action === 'left') player.inputs.left = pressed;
            if (action === 'right') player.inputs.right = pressed;
            if (action === 'jump') player.inputs.jump = pressed;
            if (action === 'attack') player.inputs.attack = pressed;
        }
    });

    // 处理重启
    socket.on('restart', () => {
        if (currentRoom && player) {
            Object.values(currentRoom.players).forEach(p => {
                p.health = CONFIG.MAX_HEALTH;
                p.x = p.id === 'player1' ? 200 : 1000;
                p.y = CONFIG.GROUND_Y;
                p.velocityX = 0;
                p.velocityY = 0;
            });
            currentRoom.gameRunning = true;
            io.to(currentRoom.code).emit('gameStart');
        }
    });

    // 处理断开连接
    socket.on('disconnect', () => {
        console.log('玩家断开连接:', socket.id);

        // 清理玩家数据
        for (const [roomCode, room] of rooms.entries()) {
            if (room.players[socket.id]) {
                const playerId = room.players[socket.id].id;
                room.removePlayer(playerId);

                // 通知其他玩家
                socket.to(roomCode).emit('playerLeft', {
                    playerId,
                    playerCount: room.getPlayerCount(),
                    maxPlayers: CONFIG.MAX_PLAYERS
                });

                console.log(`玩家 ${playerId} 已从房间 ${roomCode} 中移除`);

                // 如果房间为空，删除房间
                if (room.getPlayerCount() === 0) {
                    rooms.delete(roomCode);
                    console.log(`房间 ${roomCode} 已删除`);
                }

                break;
            }
        }
    });
});

// 游戏循环
setInterval(() => {
    // 更新所有房间
    rooms.forEach((room, roomCode) => {
        if (room.gameRunning && room.getPlayerCount() > 0) {
            // 更新所有玩家
            Object.values(room.players).forEach(player => {
                player.update();
            });

            // 发送游戏状态给房间内所有客户端
            const state = {
                players: {}
            };
            Object.values(room.players).forEach(player => {
                state.players[player.id] = player.getState();
            });

            io.to(roomCode).emit('gameState', state);
        }
    });
}, 1000 / 60); // 60 FPS

// 处理进程退出和异常
function cleanup() {
    console.log('正在清理资源...');

    // 关闭所有Socket连接
    if (io) {
        io.sockets.emit('serverShutdown');
        io.close();
    }

    // 关闭HTTP服务器
    if (server) {
        server.close(() => {
            console.log('服务器已关闭');
            process.exit(0);
        });

        // 强制退出（如果5秒后仍未正常关闭）
        setTimeout(() => {
            console.log('强制关闭服务器...');
            process.exit(0);
        }, 5000);
    } else {
        process.exit(0);
    }
}

// 监听进程退出信号
process.on('SIGINT', cleanup);  // Ctrl+C
process.on('SIGTERM', cleanup); // kill 命令
process.on('uncaughtException', (err) => {
    console.error('未捕获的异常:', err);
    cleanup();
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
});

// 启动服务器
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

function getLocalIPv4() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
            if (net && net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return null;
}

function printStartupInfo(actualPort) {
    const ip = getLocalIPv4();
    console.log(`===================================`);
    console.log(`火柴人格斗游戏服务器已启动！`);
    console.log(`===================================`);
    console.log(`本地访问: http://localhost:${actualPort}`);
    if (ip) {
        console.log(`局域网访问: http://${ip}:${actualPort}`);
    }
    console.log(`游戏地址: http://localhost:${actualPort}/stickman-fight.html`);
    console.log(`===================================`);
    console.log(`等待玩家连接...`);
    console.log(`(支持单人进入，可通过邀请码邀请好友)`);
    console.log(`===================================`);

    setTimeout(() => {
        console.log('\n如果无法访问，请检查：');
        console.log('1. 服务器窗口是否还在运行（不要关闭运行 node server.js 的窗口）');
        console.log('2. 防火墙设置，确保允许 Node.js 通过防火墙');
        console.log('3. 是否启用了代理/VPN（可临时关闭再试）');
        console.log('4. 浏览器是否使用了代理或特殊插件');
    }, 30000);
}

let tries = 0;
const MAX_TRIES = 20;

server.on('error', (error) => {
    console.error('服务器启动错误:', error && error.code ? error.code : error);

    if (error && error.code === 'EADDRINUSE') {
        tries += 1;
        if (tries >= MAX_TRIES) {
            console.error(`端口从 ${PORT} 起连续尝试 ${MAX_TRIES} 次都被占用，请先关闭占用端口的程序后再启动。`);
            return;
        }

        const nextPort = PORT + tries;
        console.error(`端口 ${PORT + tries - 1} 被占用，改用端口 ${nextPort} 继续启动...`);
        setTimeout(() => {
            try {
                server.listen(nextPort, HOST);
            } catch (e) {
                console.error('重试监听端口失败:', e);
            }
        }, 200);
        return;
    }
});

server.listen(PORT, HOST, () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : PORT;
    printStartupInfo(actualPort);
});

// 添加一个简单的HTTP路由来关闭服务器（仅用于测试）
app.get('/shutdown', (req, res) => {
    res.send('正在关闭服务器...');
    console.log('收到关闭请求，正在关闭服务器...');
    cleanup();
});

