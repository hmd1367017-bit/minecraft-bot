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
let isBotSpawned = false;
let lastStatus = null;

// ================= [ AFK BOT LOGIC ] =================
function createMinecraftBot() {
    console.log(`[Minecraft AFK Bot] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);

    if (mcBot) {
        try { mcBot.quit(); } catch (e) {}
        mcBot = null;
    }

    isBotSpawned = false;
    updateVoiceChannel(); // সার্ভার অফ হলে সাথে সাথে অফলাইন আপডেট করবে

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3', 
        auth: 'offline',   
        checkTimeoutInterval: 30000 
    });

    // বট যখনই সফলভাবে সার্ভারে ঢুকে স্পন হবে
    mcBot.once('spawn', () => {
        console.log('[Minecraft AFK Bot] Bot successfully spawned in world!');
        isBotSpawned = true;
        updateVoiceChannel(); // সাথে সাথে অনলাইন স্ট্যাটাস আপডেট করবে

        // Anti-AFK Jump (Every 3 minutes)
        setTimeout(() => {
            setInterval(() => {
                if (mcBot && mcBot.entity && isBotSpawned) {
                    mcBot.setControlState('jump', true);
                    setTimeout(() => {
                        mcBot.setControlState('jump', false);
                    }, 500);
                }
            }, 180000);
        }, 10000);
    });

    // কেউ সার্ভারে আসলে বা গেলে কাউন্ট আপডেট হবে
    mcBot.on('playerJoined', () => {
        if (isBotSpawned) updateVoiceChannel();
    });

    mcBot.on('playerLeft', () => {
        if (isBotSpawned) updateVoiceChannel();
    });

    // সার্ভার বন্ধ হলে বা ডিসকানেক্ট হলে
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Disconnected. Reason: ${reason}. Retrying in 15 seconds...`);
        isBotSpawned = false;
        updateVoiceChannel(); // সাথে সাথে অফলাইন আপডেট করবে
        
        setTimeout(createMinecraftBot, 15000);
    });

    // কোনো এরর ঘটলে
    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
        isBotSpawned = false;
        updateVoiceChannel();
    });
}

// ================= [ VOICE CHANNEL UPDATER ] =================
async function updateVoiceChannel() {
  try {
    if (!VOICE_CHANNEL_ID) return;

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    let newName = '';
    
    // যদি বট সত্যিকার অর্থেই সার্ভারের ভেতরে স্পন হয়ে থাকে
    if (isBotSpawned && mcBot && mcBot.entity && mcBot.players) {
      // বট নিজের নাম বাদ দিয়ে আসল প্লেয়ার গুনবে
      const realPlayers = Object.keys(mcBot.players).filter(
        (username) => username.toLowerCase() !== MC_USERNAME.toLowerCase()
      );
      
      const realCount = realPlayers.length;
      newName = `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online - ${realCount}`;
    } else {
      // সার্ভার অফলাইন থাকলে বা বট ডিসকানেক্টেড থাকলে
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

// অতিরিক্ত সেফটি লুপ: প্রতি ৩০ সেকেন্ড পর পর চেক করবে বট স্পন থাকা সত্ত্বেও স্ট্যাটাস অফলাইন আটকে আছে কি না
setInterval(() => {
    if (isBotSpawned && mcBot && mcBot.entity) {
        updateVoiceChannel();
    }
}, 30000);

// ================= [ DISCORD EVENTS ] =================
client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  createMinecraftBot();
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (isBotSpawned) {
      message.reply('🟢 **Minecraft Server Status:** Online');
    } else {
      message.reply('🔴 **Minecraft Server Status:** Offline / Reconnecting...');
    }
  }
});

// Start Discord Bot
if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
