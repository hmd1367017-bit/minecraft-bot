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
let reconnectTimer = null;
let updateDebounceTimer = null; // ফ্লিকারিং রোধ করার জন্য ডিবাউন্স টাইমার

// ================= [ AFK BOT LOGIC ] =================
function createMinecraftBot() {
    if (mcBot) {
        try {
            mcBot.removeAllListeners();
            mcBot.quit();
        } catch (e) {}
        mcBot = null;
    }

    isBotSpawned = false;
    console.log(`[Minecraft AFK Bot] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);
    triggerUpdate(0); // সাথে সাথে অফলাইন স্ট্যাটাস আপডেট করবে

    try {
        mcBot = mineflayer.createBot({
            host: MC_HOST,
            port: MC_PORT,
            username: MC_USERNAME,
            version: '1.20.3', 
            auth: 'offline',   
            checkTimeoutInterval: 60000 
        });
    } catch (err) {
        console.error('[Minecraft AFK Bot] Creation Error:', err.message);
        scheduleReconnect();
        return;
    }

    // বট সফলভাবে সার্ভারে স্পন হলেই কেবল অনলাইন স্ট্যাটাস চালু হবে
    mcBot.once('spawn', () => {
        console.log('[Minecraft AFK Bot] Bot successfully spawned in world!');
        isBotSpawned = true;
        triggerUpdate(500); // স্পন হওয়ার পর ডেটা লোড হতে সামান্য সময় দিয়ে আপডেট

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

    // কেউ সার্ভারে আসলে বা গেলে ডিবাউন্স করে আপডেট কল হবে (ফ্লিকারিং মুক্ত)
    mcBot.on('playerJoined', (player) => {
        if (isBotSpawned) {
            console.log(`[Player Joined] ${player.username} joined. Processing...`);
            triggerUpdate(1000); // ১ সেকেন্ড অপেক্ষা করবে যাতে সব প্যাকেট একসাথে রিসিভ হয়
        }
    });

    mcBot.on('playerLeft', (player) => {
        if (isBotSpawned) {
            console.log(`[Player Left] ${player.username} left. Processing...`);
            triggerUpdate(1000);
        }
    });

    // সার্ভার বন্ধ হলে বা ডিসকানেক্ট হলে
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Disconnected. Reason: ${reason}.`);
        isBotSpawned = false;
        mcBot = null;
        triggerUpdate(0); // সাথে সাথে অফলাইন দেখাবে
        scheduleReconnect();
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
    });
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    console.log('[Minecraft AFK Bot] Retrying in 10 seconds...');
    reconnectTimer = setTimeout(() => {
        createMinecraftBot();
    }, 10000);
}

// ডিবাউন্সড আপডেট ফাংশন (ঘনঘন রিকোয়েস্ট বা ফ্লিকারিং আটকানোর জন্য)
function triggerUpdate(delay = 1000) {
    if (updateDebounceTimer) clearTimeout(updateDebounceTimer);
    updateDebounceTimer = setTimeout(() => {
        updateVoiceChannel();
    }, delay);
}

// ================= [ VOICE CHANNEL UPDATER ] =================
async function updateVoiceChannel() {
  try {
    if (!VOICE_CHANNEL_ID) return;

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    let newName = '';
    
    if (isBotSpawned && mcBot && mcBot.entity) {
      let realCount = 0;
      try {
        const playersMap = mcBot.players || {};
        
        // নিখুঁত ফিল্টার: বটের নাম বাদ দিয়ে এবং যে প্লেয়ারদের gamemode বা latency একটিভ আছে তাদের গণনা করা
        const realPlayers = Object.values(playersMap).filter((p) => {
            if (!p || !p.username) return false;
            if (p.username.toLowerCase() === MC_USERNAME.toLowerCase()) return false;
            return p.gamemode !== undefined || p.latency !== undefined;
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
      newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
    }

    // নাম হুবহু এক থাকলে ডিসকর্ডে হাত দেবে না, পরিবর্তন হলেই কেবল এডিট করবে
    if (lastStatus !== newName) {
      try {
        await channel.setName(newName);
        lastStatus = newName;
        console.log(`[Status Counter] Voice channel successfully updated to: "${newName}"`);
      } catch (err) {
        console.error('[Discord Error] Failed to set channel name:', err.message);
      }
    }
  } catch (error) {
    console.error('[Discord Error] Channel fetch or update error:', error.message);
  }
}

// ব্যাকগ্রাউন্ড সেফটি লুপ (প্রতি ৩০ সেকেন্ড পর পর জাস্ট স্ট্যাটাস মিলিয়ে দেখার জন্য)
setInterval(() => {
    if (isBotSpawned) {
        triggerUpdate(0);
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
