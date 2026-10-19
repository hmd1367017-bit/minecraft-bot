require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');
const net = require('net'); // ✅ সরাসরি পোর্ট চেক করার জন্য

// ================= [ ENV CONFIG ] =================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const MC_HOST = process.env.MC_HOST || 'bdtopsmp.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 48115;
const MC_USERNAME = process.env.MC_USERNAME || 'MANAGER_1734';

// ================= [ DISCORD CLIENT ] =================
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
let reconnectTimeout = null;
let afkInterval = null;
let updateTimer = null;
let isServerOnline = false; // ✅ সার্ভারের আসল স্ট্যাটাস ট্র্যাক করার জন্য

const RECONNECT_DELAY = 10000; // ১০ সেকেন্ড

// ================= [ TCP SOCKET PING (Fast Server Check) ] =================
function checkServerOnline() {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(4000); // ৪ সেকেন্ড টাইমআউট

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(MC_PORT, MC_HOST);
    });
}

// ================= [ MINECRAFT BOT ] =================
function createMinecraftBot() {
    if (mcBot) {
        try { mcBot.removeAllListeners(); mcBot.quit(); } catch (e) {}
        mcBot = null;
    }
    if (afkInterval) { clearInterval(afkInterval); afkInterval = null; }

    console.log(`[Minecraft] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);
    isBotSpawned = false;

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3',
        auth: 'offline',
        checkTimeoutInterval: 20000
    });

    mcBot.once('spawn', () => {
        console.log('[Minecraft] Spawn packet received — Online!');
        isBotSpawned = true;
        isServerOnline = true;
        scheduleUpdate();

        // Anti-AFK jump (প্রতি ৩ মিনিটে)
        if (afkInterval) clearInterval(afkInterval);
        afkInterval = setInterval(() => {
            if (!isBotSpawned || !mcBot) {
                clearInterval(afkInterval);
                afkInterval = null;
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
        }, 180000);
    });

    mcBot.on('playerJoined', () => { if (isBotSpawned) scheduleUpdate(); });
    mcBot.on('playerLeft', () => { if (isBotSpawned) scheduleUpdate(); });

    mcBot.on('end', (reason) => {
        console.log(`[Minecraft] Disconnected: ${reason}. Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
        cleanupAndOffline();
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(createMinecraftBot, RECONNECT_DELAY);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft] Error:', err.message);
        cleanupAndOffline();
        try { if (mcBot) mcBot.quit(); } catch (e) {}
    });
}

function cleanupAndOffline() {
    isBotSpawned = false;
    isServerOnline = false;
    if (afkInterval) { clearInterval(afkInterval); afkInterval = null; }
    scheduleUpdate();
}

// ================= [ STATUS UPDATER ] =================
function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateVoiceChannel, 500);
}

async function updateVoiceChannel() {
    try {
        if (!VOICE_CHANNEL_ID) return;

        // ব্যাকগ্রাউন্ডে সরাসরি পোর্ট চেক করে নিশ্চিত হওয়া সার্ভার আসলেই অন আছে কিনা
        const onlineStatus = await checkServerOnline();
        isServerOnline = onlineStatus;

        const channel = await client.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        let newName;

        if (isServerOnline && isBotSpawned && mcBot) {
            let realCount = 0;
            try {
                const playersMap = mcBot.players || {};
                const realPlayers = Object.values(playersMap).filter((p) => {
                    if (!p || !p.username) return false;
                    return p.username.toLowerCase() !== MC_USERNAME.toLowerCase();
                });
                realCount = realPlayers.length;
            } catch (e) { realCount = 0; }

            newName = realCount === 0
                ? `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online`
                : `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online - ${realCount}`;
        } else {
            newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
        }

        if (lastStatus === newName) return;

        console.log(`[Voice Channel] Setting: "${newName}"`);
        try {
            await channel.setName(newName);
            lastStatus = newName;
            console.log(`[Voice Channel] ✅ Done: "${newName}"`);
        } catch (e) {
            console.error(`[Voice Channel] ❌ Failed:`, e.message);
        }
    } catch (error) {
        console.error('[Discord Error]:', error.message);
    }
}

// প্রতি ১০ সেকেন্ড পর পর মেইন লুপে স্ট্যাটাস রি-চেক করবে যাতে আটকে না থাকে
setInterval(() => {
    scheduleUpdate();
}, 10000);

// ================= [ DISCORD EVENTS ] =================
client.once('clientReady', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  createMinecraftBot();
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (isServerOnline && isBotSpawned && mcBot) {
      let realCount = 0;
      try {
        const playersMap = mcBot.players || {};
        realCount = Object.values(playersMap).filter((p) => {
          if (!p || !p.username) return false;
          return p.username.toLowerCase() !== MC_USERNAME.toLowerCase();
        }).length;
      } catch (e) { realCount = 0; }
      message.reply(`🟢 **Minecraft Server:** Online\n👥 **Players:** ${realCount}`);
    } else {
      message.reply('🔴 **Minecraft Server:** Offline / Reconnecting...');
    }
  }
});

// ================= [ START ] =================
if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing!');
  process.exit(1);
}
if (!VOICE_CHANNEL_ID) {
  console.error('[Warning] VOICE_CHANNEL_ID is missing.');
}

client.login(DISCORD_TOKEN);
