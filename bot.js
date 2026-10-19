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
let isServerOnline = false;
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
        isServerOnline = true;
        updateVoiceChannel();

        // Anti-AFK Jump (Every 3 minutes)
        setTimeout(() => {
            setInterval(() => {
                if (mcBot && mcBot.entity && isServerOnline) {
                    mcBot.setControlState('jump', true);
                    setTimeout(() => {
                        mcBot.setControlState('jump', false);
                    }, 500);
                }
            }, 180000);
        }, 10000);
    });

    mcBot.on('playerJoined', (player) => {
        console.log(`[Minecraft] Player joined: ${player.username}`);
        if (isServerOnline) setTimeout(updateVoiceChannel, 1000);
    });

    mcBot.on('playerLeft', (player) => {
        console.log(`[Minecraft] Player left: ${player.username}`);
        if (isServerOnline) setTimeout(updateVoiceChannel, 1000);
    });

    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Bot disconnected. Reason: ${reason}.`);
        isServerOnline = false;
        if (mcBot) mcBot.players = {};
        updateVoiceChannel();
        setTimeout(createMinecraftBot, 5000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
        isServerOnline = false;
        if (mcBot) mcBot.players = {};
        updateVoiceChannel();
    });
}

// ================= [ SERVER PORT CHECKER ] =================
// ব্যাকগ্রাউন্ডে সরাসরি নেটওয়ার্ক পোর্ট চেক করে নিশ্চিত করবে সার্ভার অন নাকি অফ
function checkServerStatusDirectly() {
    const socket = new net.Socket();
    socket.setTimeout(3000); // ৩ সেকেন্ডের বেশি সাড়া না পেলে অফলাইন ধরা হবে

    socket.connect(MC_PORT, MC_HOST, () => {
        socket.destroy();
        if (!isServerOnline) {
            isServerOnline = true;
            updateVoiceChannel();
        }
    });

    socket.on('error', () => {
        socket.destroy();
        if (isServerOnline) {
            isServerOnline = false;
            if (mcBot) mcBot.players = {};
            updateVoiceChannel();
        }
    });

    socket.on('timeout', () => {
        socket.destroy();
        if (isServerOnline) {
            isServerOnline = false;
            if (mcBot) mcBot.players = {};
            updateVoiceChannel();
        }
    });
}

// প্রতি ১০ সেকেন্ড পর পর পোর্ট নক করে স্ট্যাটাস চেক করবে
setInterval(checkServerStatusDirectly, 10000);

// ================= [ VOICE CHANNEL UPDATER ] =================
async function updateVoiceChannel() {
  try {
    if (!VOICE_CHANNEL_ID) return;

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    let newName = '';
    
    // যদি পোর্ট চেকার এবং বট দুটোই অন নিশ্চিত করে
    if (isServerOnline && mcBot && mcBot.entity && mcBot.players) {
      // বট বাদে অন্য আসল প্লেয়ারদের তালিকা তৈরি
      const realPlayers = Object.keys(mcBot.players).filter(
        (username) => username.toLowerCase() !== MC_USERNAME.toLowerCase()
      );
      
      const realPlayerCount = realPlayers.length;
      newName = `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online - ${realPlayerCount}`;
    } else {
      // সার্ভার বন্ধ থাকলে বা পোর্ট রেসপন্স না করলে
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

// ================= [ DISCORD EVENTS ] =================
client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  createMinecraftBot();
  checkServerStatusDirectly();
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (isServerOnline) {
      message.reply('🟢 **Minecraft AFK Bot Status:** Online');
    } else {
      message.reply('🔴 **Minecraft AFK Bot Status:** Offline / Reconnecting...');
    }
  }
});

// Start Discord Bot
if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
