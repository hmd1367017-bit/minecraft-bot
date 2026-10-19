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
        console.log('[Minecraft] Spawn packet received — verifying real connection...');

        // ধাপ ১: ৫ সেকেন্ড অপেক্ষা
        setTimeout(() => {
            if (!mcBot || !mcBot.entity || !mcBot.entity.position) {
                console.log('[Minecraft] Ghost spawn detected — no valid entity. Ignoring.');
                return;
            }

            const pos = mcBot.entity.position;
            if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
                console.log('[Minecraft] Invalid position — Ghost spawn. Ignoring.');
                return;
            }

            // ধাপ ২: আরও ৩ সেকেন্ড অপেক্ষা
            setTimeout(() => {
                if (!mcBot || !mcBot.entity || !mcBot.entity.position) {
                    console.log('[Minecraft] Connection lost during verification — Offline.');
                    return;
                }

                // ✅ সব যাচাই পাস — সত্যিই অনলাইন
                console.log(`[Minecraft] Real connection confirmed at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}) — Online`);
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

    mcBot.on('playerJoined', (player) => {
        if (isBotSpawned) {
            console.log(`[Minecraft] Player joined: ${player.username}`);
            scheduleUpdate();
        }
    });

    mcBot.on('playerLeft', (player) => {
        if (isBotSpawned) {
            console.log(`[Minecraft] Player left: ${player.username}`);
            scheduleUpdate();
        }
    });

    // ✅ ডিসকানেক্ট → Offline
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft] Bot disconnected. Reason: ${reason}. Reconnecting in 5 seconds...`);
        isBotSpawned = false;
        mcBot = null;
        if (afkInterval) { clearInterval(afkInterval); afkInterval = null; }
        scheduleUpdate();

        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(createMinecraftBot, 5000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft] Error encountered:', err.message);
        isBotSpawned = false;
        scheduleUpdate();
        try { if (mcBot) mcBot.quit(); } catch (e) {}
    });
}

// ================= [ STATUS UPDATER ] =================
function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updateVoiceChannel, 2000); // ২ সেকেন্ড debounce
}

async function updateVoiceChannel() {
    try {
        if (!VOICE_CHANNEL_ID) return;

        const channel = await client.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        let newName;

        if (isBotSpawned && mcBot) {
            // প্লেয়ার সংখ্যা গণনা (নিজেকে বাদ দিয়ে)
            let realCount = 0;
            try {
                const playersMap = mcBot.players || {};
                const realPlayers = Object.values(playersMap).filter((p) => {
                    if (!p || !p.username) return false;
                    return p.username.toLowerCase() !== MC_USERNAME.toLowerCase();
                });
                realCount = realPlayers.length;
            } catch (e) {
                realCount = 0;
            }

            newName = realCount === 0
                ? `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online`
                : `🔵┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Online - ${realCount}`;
        } else {
            newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
        }

        // নাম একই হলে setName করবে না
        if (lastStatus === newName) return;

        console.log(`[Voice Channel] Attempting to set: "${newName}"`);
        try {
            await channel.setName(newName);
            lastStatus = newName;
            console.log(`[Voice Channel] ✅ Success: "${newName}"`);
        } catch (e) {
            console.error(`[Voice Channel] ❌ setName failed:`, e.message);
            // ব্যর্থ হলেও lastStatus আপডেট, যাতে বারবার লুপ না হয়
            lastStatus = newName;
        }
    } catch (error) {
        console.error('[Discord Error] Failed to update voice channel:', error.message);
    }
}

// প্রতি ৫ সেকেন্ডে স্ট্যাটাস চেক (প্লেয়ার সংখ্যা পরিবর্তন ধরতে)
setInterval(() => scheduleUpdate(), 5000);

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

      message.reply(`🟢 **Minecraft Server Status:** Online\n👥 **Players Online:** ${realCount}`);
    } else {
      message.reply('🔴 **Minecraft Server Status:** Offline / Reconnecting...');
    }
  }
});

// ================= [ START ] =================
if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}
if (!VOICE_CHANNEL_ID) {
  console.error('[Warning] VOICE_CHANNEL_ID is missing — status updates will be skipped.');
}

client.login(DISCORD_TOKEN);
