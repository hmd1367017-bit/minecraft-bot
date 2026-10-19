require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');
const net = require('net');

// Environment Variables Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const MC_HOST = process.env.MC_HOST || 'bdtopsmp.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 48115;
const MC_USERNAME = process.env.MC_USERNAME || 'MANAGER_1734';

// Discord Client Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let mcBot = null;
let lastStatus = null;

// ================= [ AFK BOT LOGIC ] =================
function createMinecraftBot() {
    console.log(`[Minecraft AFK Bot] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3', 
        auth: 'offline',   
        checkTimeoutInterval: 60000 
    });

    mcBot.once('spawn', () => {
        console.log('[Minecraft AFK Bot] Bot successfully spawned in world!');

        setTimeout(() => {
            setInterval(() => {
                if (mcBot && mcBot.entity) {
                    mcBot.setControlState('jump', true);
                    setTimeout(() => {
                        mcBot.setControlState('jump', false);
                    }, 500);
                }
            }, 180000); // প্রতি ৩ মিনিট পর পর এন্টি-এএফকে জাম্প
        }, 10000);
    });

    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Bot disconnected. Reason: ${reason}. Reconnecting in 5 seconds...`);
        setTimeout(createMinecraftBot, 5000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
    });
}

// ================= [ LIVE PLAYER COUNTER LOGIC ] =================
function checkMinecraftServer() {
  const socket = new net.Socket();
  let buffer = Buffer.alloc(0);
  let isConnected = false;

  socket.setTimeout(4000); // ৪ সেকেন্ড টাইমআউট

  socket.connect(MC_PORT, MC_HOST, () => {
    isConnected = true;
    
    // Minecraft Server List Ping Handshake Packet
    const hostBuffer = Buffer.from(MC_HOST, 'utf8');
    const packetData = Buffer.concat([
      Buffer.from([0x00]), 
      writeVarInt(47),     
      writeVarInt(hostBuffer.length),
      hostBuffer,
      Buffer.from(toBytes(MC_PORT, 2)), 
      Buffer.from([0x01])  
    ]);

    const handshake = Buffer.concat([writeVarInt(packetData.length), packetData]);
    const request = Buffer.from([0x01, 0x00]); 

    socket.write(Buffer.concat([handshake, request]));
  });

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    try {
      const packetLength = readVarInt(buffer);
      if (buffer.length < packetLength.length + packetLength.value) return;

      const jsonString = buffer.toString('utf8', packetLength.length + 1);
      const jsonResponse = JSON.parse(jsonString);

      const onlinePlayers = jsonResponse.players && typeof jsonResponse.players.online === 'number' 
        ? jsonResponse.players.online 
        : 0;

      updateVoiceChannel(`🔵┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Online - ${onlinePlayers}`);
      socket.destroy();
    } catch (e) {
      // JSON Parsing Guard
    }
  });

  socket.on('error', () => {
    if (!isConnected) {
      socket.destroy();
      updateVoiceChannel(`🔴┊𝐌𝐂-Automated Status : Offline`);
    }
  });

  socket.on('timeout', () => {
    if (!isConnected) {
      socket.destroy();
      updateVoiceChannel(`🔴┊𝐌𝐂-PL\nAYER : Offline`);
    }
  });
}

async function updateVoiceChannel(newName) {
  try {
    if (!VOICE_CHANNEL_ID) return;

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    if (lastStatus !== newName) {
      await channel.setName(newName);
      lastStatus = newName;
      console.log(`[Status Counter] Voice channel updated to: "${newName}"`);
    }
  } catch (error) {
    console.error('[Discord Error] Failed to update voice channel:', error.message);
  }
}

// ================= [ DISCORD EVENTS ] =================
client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  
  // AFK বট চালু
  createMinecraftBot();

  // প্লেয়ার কাউন্টার স্ট্যাটাস চেক শুরু (প্রথমবার এবং এরপর প্রতি ১০ সেকেন্ড পর পর)
  checkMinecraftServer();
  setInterval(checkMinecraftServer, 10000);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (mcBot && mcBot.player) {
      message.reply('🟢 **Minecraft AFK Bot Status:** Online');
    } else {
      message.reply('🔴 **Minecraft AFK Bot Status:** Offline / Reconnecting...');
    }
  }
});

// Helper Functions for Minecraft Protocol Handling
function writeVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & ~0x7F) === 0) {
      bytes.push(value);
      break;
    }
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer) {
  let numRead = 0;
  let result = 0;
  let read;
  do {
    read = buffer[numRead];
    result |= (read & 0x7F) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt is too big');
  } while ((read & 0x80) === 0x80);
  return { value: result, length: numRead };
}

function toBytes(number, bytes) {
  const buf = new Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) {
    buf[i] = number & 0xff;
    number = number >> 8;
  }
  return buf;
}

// Start Discord Bot
if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
