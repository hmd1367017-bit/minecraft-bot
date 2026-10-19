require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');

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
                if (mcBot && mcBot.entity) {
                    mcBot.setControlState('jump', true);
                    setTimeout(() => {
                        mcBot.setControlState('jump', false);
                    }, 500);
                }
            }, 180000);
        }, 10000);
    });

    // কেউ সার্ভারে প্রবেশ করলে সাথে সাথে কাউন্ট আপডেট হবে
    mcBot.on('playerJoined', (player) => {
        console.log(`[Minecraft] Player joined: ${player.username}`);
        updateVoiceChannel();
    });

    // কেউ সার্ভার থেকে বের হয়ে গেলে সাথে সাথে কাউন্ট আপডেট হবে
    mcBot.on('playerLeft', (player) => {
        console.log(`[Minecraft] Player left: ${player.username}`);
        updateVoiceChannel();
    });

    // সার্ভার বন্ধ বা ডিসকানেক্ট হলে
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Bot disconnected. Reason: ${reason}. Reconnecting in 5 seconds...`);
        isServerOnline = false;
        updateVoiceChannel();
        setTimeout(createMinecraftBot, 5000);
    });

    // যেকোনো এরর ঘটলে
    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
        isServerOnline = false;
        updateVoiceChannel();
    });
}

// ================= [ VOICE CHANNEL UPDATER ] =================
async function updateVoiceChannel() {
  try {
    if (!VOICE_CHANNEL_ID) {
      console.error('[Error] VOICE_CHANNEL_ID is missing in Environment Variables!');
      return;
    }

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    let newName = '';
    if (isServerOnline && mcBot && mcBot.players) {
      // সার্ভার অন থাকলে ভেতরে থাকা মোট প্লেয়ার সংখ্যা দেখাবে (বট সহ)
      const onlineCount = Object.keys(mcBot.players).length;
      newName = `🔵┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Online - ${onlineCount}`;
    } else {
      newName = `🔴┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Offline`;
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
