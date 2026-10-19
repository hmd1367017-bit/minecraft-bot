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

// ================= [ MINECRAFT BOT LOGIC ] =================
function createMinecraftBot() {
    console.log(`[Minecraft] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);
    isBotSpawned = false;
    updateVoiceChannel(); // কানেক্ট করার চেষ্টার সময় অফলাইন স্ট্যাটাস সেট করবে

    if (mcBot) {
        try {
            mcBot.removeAllListeners();
            mcBot.quit();
        } catch (e) {}
        mcBot = null;
    }

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3', 
        auth: 'offline',   
        checkTimeoutInterval: 60000 
    });

    mcBot.once('spawn', () => {
        console.log('[Minecraft] Bot successfully spawned in world!');
        isBotSpawned = true;
        updateVoiceChannel(); // স্পন হওয়ার সাথে সাথে অনলাইন আপডেট করবে

        // Anti-AFK Jump
        setTimeout(() => {
            const afkInterval = setInterval(() => {
                if (!isBotSpawned || !mcBot) {
                    clearInterval(afkInterval);
                    return;
                }
                try {
                    if (mcBot && mcBot.entity) {
                        mcBot.setControlState('jump', true);
                        setTimeout(() => {
                            if (mcBot) mcBot.setControlState('jump', false);
                        }, 500);
                    }
                } catch (e) {}
            }, 180000); // প্রতি ৩ মিনিট পর পর জাম্প
        }, 10000);
    });

    // কেউ সার্ভারে আসলে বা গেলে আপডেট করবে
    mcBot.on('playerJoined', () => {
        if (isBotSpawned) updateVoiceChannel();
    });

    mcBot.on('playerLeft', () => {
        if (isBotSpawned) updateVoiceChannel();
    });

    mcBot.on('end', (reason) => {
        console.log(`[Minecraft] Bot disconnected. Reason: ${reason}. Reconnecting in 5 seconds...`);
        isBotSpawned = false;
        mcBot = null;
        updateVoiceChannel(); // ডিসকানেক্ট হওয়া মাত্র অফলাইন আপডেট করবে
        setTimeout(createMinecraftBot, 5000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft] Error encountered:', err.message);
        isBotSpawned = false;
        updateVoiceChannel();
    });
}

// ================= [ VOICE CHANNEL STATUS UPDATER ] =================
async function updateVoiceChannel() {
    try {
        if (!VOICE_CHANNEL_ID) return;

        const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
        if (!channel) return;

        let newName = '';

        // যদি বট সফলভাবে সার্ভারে স্পন হয়ে থাকে
        if (isBotSpawned && mcBot && mcBot.entity) {
            let realCount = 0;
            try {
                const playersMap = mcBot.players || {};
                const realPlayers = Object.values(playersMap).filter((p) => {
                    if (!p || !p.username) return false;
                    return p.username.toLowerCase() !== MC_USERNAME.toLowerCase();
                });
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
            // সার্ভার অফলাইন বা বট ডিসকানেক্টেড থাকলে
            newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
        }

        // অত্যন্ত গুরুত্বপূর্ণ: স্ট্যাটাস যদি আগেরটার মতোই থাকে, তবে ডিসকর্ডে আর কোনো রিকোয়েস্ট পাঠানো হবে না
        if (lastStatus !== newName) {
            await channel.setName(newName);
            lastStatus = newName;
            console.log(`[Voice Channel] Status updated to: "${newName}"`);
        }
    } catch (error) {
        console.error('[Discord Error] Failed to update voice channel:', error.message);
    }
}

// প্রতি ১০ সেকেন্ড পর পর ব্যাকআপ হিসেবে স্ট্যাটাস চেক করবে (একই থাকলে ডিসকর্ডে হাত দেবে না)
setInterval(() => {
    updateVoiceChannel();
}, 10000);

// ================= [ DISCORD EVENTS ] =================
client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  createMinecraftBot();
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (isBotSpawned) {
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
