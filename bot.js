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
        try { 
            mcBot.removeAllListeners();
            mcBot.quit(); 
        } catch (e) {}
        mcBot = null;
    }

    isBotSpawned = false;
    updateVoiceChannel(); // সাথে সাথে অফলাইন স্ট্যাটাস আপডেট করবে

    try {
        mcBot = mineflayer.createBot({
            host: MC_HOST,
            port: MC_PORT,
            username: MC_USERNAME,
            version: '1.20.3', 
            auth: 'offline',   
            checkTimeoutInterval: 30000 
        });
    } catch (err) {
        console.error('[Minecraft AFK Bot] Creation Error:', err.message);
        isBotSpawned = false;
        updateVoiceChannel();
        return;
    }

    // বট সফলভাবে সার্ভারে স্পন হলেই কেবল অনলাইন স্ট্যাটাস চালু হবে
    mcBot.once('spawn', () => {
        console.log('[Minecraft AFK Bot] Bot successfully spawned in world!');
        isBotSpawned = true;
        updateVoiceChannel();

        // Anti-AFK Jump (প্রতি ৩ মিনিট পর পর)
        setTimeout(() => {
            const afkInterval = setInterval(() => {
                if (!isBotSpawned || !mcBot) {
                    clearInterval(afkInterval);
                    return;
                }
                try {
                    if (mcBot.entity) {
                        mcBot.setControlState('jump', true);
                        setTimeout(() => {
                            if (mcBot) mcBot.setControlState('jump', false);
                        }, 500);
                    }
                } catch (e) {}
            }, 180000);
        }, 10000);
    });

    // কেউ সার্ভারে আসলে বা গেলে তাৎক্ষণিক আপডেট করবে
    mcBot.on('playerJoined', () => {
        if (isBotSpawned) updateVoiceChannel();
    });

    mcBot.on('playerLeft', () => {
        if (isBotSpawned) updateVoiceChannel();
    });

    // সার্ভার বন্ধ হলে বা কিক খেলে বা কানেক্ট না হতে পারলে
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Disconnected. Reason: ${reason}. Retrying in 10 seconds...`);
        isBotSpawned = false;
        mcBot = null; 
        updateVoiceChannel(); // তাৎক্ষণিক অফলাইন আপডেট করবে
        
        setTimeout(createMinecraftBot, 10000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
        isBotSpawned = false;
        mcBot = null;
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
    
    // যদি বট স্পন হয়ে থাকে এবং বটের এন্ট্রিতি ওয়ার্ল্ডে থাকে
    if (isBotSpawned && mcBot && mcBot.entity) {
      let realCount = 0;
      try {
        const playersObj = mcBot.players || {};
        const playerUsernames = Object.keys(playersObj);
        
        // বট নিজের নাম বাদ দিয়ে বাকি রিয়েল প্লেয়ারদের গুনবে
        const realPlayers = playerUsernames.filter(
          (username) => username && username.toLowerCase() !== MC_USERNAME.toLowerCase()
        );
        realCount = realPlayers.length;
      } catch (err) {
        realCount = 0;
      }

      if (realCount === 0) {
        newName = `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online`;
      } else {
        newName = `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online - ${realCount}`;
      }
    } else {
      // সার্ভার অফলাইন থাকলে বা বট কানেক্ট না হতে পারলে অবিলম্বে অফলাইন দেখাবে
      newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
    }

    if (lastStatus !== newName) {
      try {
        await channel.setName(newName);
        lastStatus = newName;
        console.log(`[Status Counter] Voice channel updated to: "${newName}"`);
      } catch (err) {
        console.error('[Discord Error] Failed to set channel name, will retry:', err.message);
        lastStatus = null; 
      }
    }
  } catch (error) {
    console.error('[Discord Error] Channel fetch or update error:', error.message);
  }
}

// ব্যাকগ্রাউন্ড চেকার লুপ: প্রতি ৫ সেকেন্ড পর পর স্ট্যাটাস সিঙ্ক রাখবে
setInterval(() => {
    updateVoiceChannel();
}, 5000);

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
