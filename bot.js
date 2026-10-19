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
let cachedOnlineCount = 0;
let isActuallyOnline = false;

// ================= [ AFK BOT LOGIC ] =================
function createMinecraftBot() {
    console.log(`[Minecraft AFK Bot] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3', 
        auth: 'offline',   
        checkTimeoutInterval: 30000 
    });

    mcBot.once('spawn', () => {
        console.log('[Minecraft AFK Bot] Bot successfully spawned in world!');

        // Anti-AFK Jump (Every 3 minutes)
        setTimeout(() => {
            setInterval(() => {
                if (mcBot && mcBot.entity) {
                    mcBot.setControlState('jump', true);
                    setTimeout(() => {
                        mcBot.setControlState('jump', false);
                    }, 500);
                }
            }, 180000);
        }, 10000);
    });

    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Bot disconnected. Reason: ${reason}. Reconnecting in 10 seconds...`);
        setTimeout(createMinecraftBot, 10000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
    });
}

// ================= [ DIRECT PING & PLAYER COUNTER ] =================
// এটি বাইরে থেকে সার্ভারকে রিয়েল-টাইম পিং করে একদম সঠিক প্লেয়ার সংখ্যা ও অনলাইন স্ট্যাটাস বের করবে
function checkMinecraftServerStatus() {
  const socket = new net.Socket();
  let buffer = Buffer.alloc(0);
  let resolved = false;

  socket.setTimeout(4000); // ৪ সেকেন্ড টাইমআউট

  socket.connect(MC_PORT, MC_HOST, () => {
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

      const onlineCount = jsonResponse.players && typeof jsonResponse.players.online === 'number' 
        ? jsonResponse.players.online 
        : 0;

      // যদি সার্ভার রেসপন্স করে, তবে সার্ভার অনলাইন
      isActuallyOnline = true;
      // যেহেতু পিং সার্ভারে বটসহ কাউন্ট দেয়, তাই রিয়েল প্লেয়ার বের করতে বটকে বাদ দিতে হবে (যদি বট গুনে থাকে)
      // সাধারণত Aternos-এ মোট কাউন্ট থেকে বট বাদ দিলে আসল প্লেয়ার সংখ্যা পাওয়া যায়
      cachedOnlineCount = onlineCount > 0 ? onlineCount - 1 : 0;
      if (cachedOnlineCount < 0) cachedOnlineCount = 0;

      resolved = true;
      socket.destroy();
      updateVoiceChannelUI();
    } catch (e) {
      // Parsing error catch
    }
  });

  socket.on('error', () => {
    if (!resolved) {
      resolved = true;
      socket.destroy();
      markServerOffline();
    }
  });

  socket.on('timeout', () => {
    if (!resolved) {
      resolved = true;
      socket.destroy();
      markServerOffline();
    }
  });
}

function markServerOffline() {
  isActuallyOnline = false;
  cachedOnlineCount = 0;
  updateVoiceChannelUI();
}

// ================= [ VOICE CHANNEL UPDATER ] =================
async function updateVoiceChannel() {
  try {
    if (!VOICE_CHANNEL_ID) return;

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    let newName = '';
    
    if (isActuallyOnline) {
      newName = `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online - ${cachedOnlineCount}`;
    } else {
      newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
    }

    if (lastStatus !== newName) {
      await channel.setName(newName);
      lastStatus = newName;
      console.log(`[Status Counter] Voice channel updated to: "${newName}"`);
    }
  } catch (error) {
    console.error('[Discord Error] Failed to update voice channel:', error.message);
  }
}

// প্রক্সির জন্য ভয়েস চ্যানেল আপডেট কল
function updateVoiceChannelUI() {
  updateVoiceChannel();
}

// Helper Functions for Minecraft Protocol
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

// ================= [ DISCORD EVENTS ] =================
client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  
  // আফকে বট চালু
  createMinecraftBot();

  // প্রতি ১০ সেকেন্ড পর পর সার্ভার পিং করে স্ট্যাটাস ও প্লেয়ার কাউন্ট চেক করবে
  checkMinecraftServerStatus();
  setInterval(checkMinecraftServerStatus, 10000);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (isActuallyOnline) {
      message.reply(`🟢 **Minecraft Server Status:** Online (${cachedOnlineCount} players online)`);
    } else {
      message.reply('🔴 **Minecraft Server Status:** Offline');
    }
  }
});

// Start Discord Bot
if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
