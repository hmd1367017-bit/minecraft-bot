require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');

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

const RECONNECT_DELAY = 10000; // ✅ ১০ সেকেন্ড

// ================= [ MINECRAFT BOT ] =================
function createMinecraftBot() {
    if (mcBot) {
        try { mcBot.removeAllListeners(); mcBot.quit(); } catch (e) {}
        mcBot = null;
    }
    if (afkInterval) { clearInterval(afkInterval); afkInterval = null; }

    console.log(`[Minecraft] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);
    isBotSpawned = false;
    scheduleUpdate();

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3',
        auth: 'offline',
        checkTimeoutInterval: 30000
    });

    // ✅ spawn প্যাকেট পাওয়ার পর সত্যিকারের সংযোগ যাচাই
    mcBot.once('spawn', () => {
        console.log('[Minecraft] Spawn packet received — verifying...');

        setTimeout(() => {
            if (!mcBot || !mcBot.entity || !mcBot.entity.position) {
                console.log('[Minecraft] Ghost spawn — no entity. Ignoring.');
                return;
            }

            const pos = mcBot.entity.position;
            if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
                console.log('[Minecraft] Invalid position — Ghost spawn. Ignoring.');
                return;
            }

            setTimeout(() => {
                if (!mcBot || !mcBot.entity || !mcBot.entity.position) {
                    console.log('[Minecraft] Lost during verification — Offline.');
                    return;
                }

                console.log(`[Minecraft] Confirmed at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) — Online`);
                isBotSpawned = true;
                scheduleUpdate();

                // Anti-AFK jump (প্রতি ৩ মিনিটে)
                setTimeout(() => {
                    if (!isBotSpawned || !mcBot) return;
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
                }, 10000);
            }, 3000);
        }, 5000);
    });

    mcBot.on('playerJoined', () => { if (isBotSpawned) scheduleUpdate(); });
    mcBot.on('playerLeft', () => { if (isBotSpawned) scheduleUpdate(); });

    // ✅ ডিসকানেক্ট → Offline
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft] Disconnected: ${reason}. Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
        isBotSpawned = false;
        mcBot = null;
        if (afkInterval) { clearInterval(afkInterval); afkInterval = null; }
        scheduleUpdate();

        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(createMinecraftBot, RECONNECT_DELAY);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft] Error:', err.message);
        isBotSpawned = false;
        scheduleUpdate();
        try { if (mcBot) mcBot.quit(); } catch (e) {}
    });
}

// ================= [ STATUS UPDATER ] =================
function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateVoiceChannel, 1000);
}

async function updateVoiceChannel() {
    try {
        if (!VOICE_CHANNEL_ID) return;

        const channel = await client.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        let newName;

        if (isBotSpawned && mcBot) {
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

        // ✅ একই নাম হলে setName করবে না
        if (lastStatus === newName) return;

        console.log(`[Voice Channel] Setting: "${newName}"`);
        try {
            await channel.setName(newName);
            lastStatus = newName; // ✅ শুধু সফল হলে আপডেট
            console.log(`[Voice Channel] ✅ Done: "${newName}"`);
        } catch (e) {
            // ❌ ব্যর্থ হলে lastStatus আপডেট হবে না → পরের বার আবার চেষ্টা করবে
            console.error(`[Voice Channel] ❌ Failed:`, e.message);
        }
    } catch (error) {
        console.error('[Discord Error]:', error.message);
    }
}

// প্রতি ১০ সেকেন্ডে চেক
setInterval(() => scheduleUpdate(), 10000);

// ================= [ DISCORD EVENTS ] =================
client.once('clientReady', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  createMinecraftBot();
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (isBotSpawned && mcBot) {
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
