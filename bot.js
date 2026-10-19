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
    scheduleUpdate(); // সংযোগ শুরু হলে সাথে সাথে Offline চিহ্নিত করুন

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3',
        auth: 'offline',
        checkTimeoutInterval: 30000
    });

    // ✅ মূল সংশোধন: spawn হলে সরাসরি Online চিহ্নিত করুন, mcBot.entity-এর উপর আর নির্ভর করবেন না
    mcBot.once('spawn', () => {
        console.log('[Minecraft] Bot successfully spawned — Online');
        isBotSpawned = true;
        scheduleUpdate();

        // সাধারণ Anti-AFK (শুধুমাত্র মাঝে মাঝে লাফ, অতিরিক্ত চলাচল নয়)
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
            }, 180000); // প্রতি ৩ মিনিটে একবার
        }, 10000);
    });

    mcBot.on('playerJoined', () => { if (isBotSpawned) scheduleUpdate(); });
    mcBot.on('playerLeft', () => { if (isBotSpawned) scheduleUpdate(); });

    // ✅ ডিসকানেক্ট হলে Offline চিহ্নিত করুন
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
    updateTimer = setTimeout(updateVoiceChannel, 2000);
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

        // ✅ নাম একই হলে setName করবেন না, অপ্রয়োজনীয় API কল এড়ান
        if (lastStatus === newName) return;

        console.log(`[Voice Channel] Attempting to set: "${newName}"`);
        try {
            await channel.setName(newName);
            lastStatus = newName;
            console.log(`[Voice Channel] ✅ Success: "${newName}"`);
        } catch (e) {
            console.error(`[Voice Channel] ❌ setName failed:`, e.message);
        }
    } catch (error) {
        console.error('[Discord Error] Failed to update voice channel:', error.message);
    }
}

// প্রতি ১০ সেকেন্ডে চেক করুন, খুব ঘন ঘন নয়
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
