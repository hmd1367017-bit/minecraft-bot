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
    // কানেক্ট হওয়ার চেষ্টার সময় ফ্লাডিং রোধ করতে সরাসরি অফলাইন সেট না করে শুধু স্ট্যাটাস ভ্যালিডেশন রাখা হলো

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
        isBotSpawned = false;
        updateVoiceChannel();
        return;
    }

    // বট সফলভাবে সার্ভারে স্পন হলেই কেবল অনলাইন স্ট্যাটাস চালু হবে
    mcBot.once('spawn', () => {
        console.log('[Minecraft AFK Bot] Bot successfully spawned in world!');
        isBotSpawned = true;
        
        // স্পন হওয়ার সাথে সাথে এক সেকেন্ডের মধ্যে নিশ্চিতভাবে অনলাইন স্ট্যাটাস আপডেট করবে
        setTimeout(() => {
            updateVoiceChannel();
        }, 500);

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

    // কেউ সার্ভারে আসলে বা গেলে ট্যাব লিস্ট আপডেট হবে
    mcBot.on('playerJoined', (player) => {
        if (isBotSpawned) {
            console.log(`[Player Joined] ${player.username} joined the game.`);
            updateVoiceChannel();
        }
    });

    mcBot.on('playerLeft', (player) => {
        if (isBotSpawned) {
            console.log(`[Player Left] ${player.username} left the game.`);
            updateVoiceChannel();
        }
    });

    // সার্ভার বন্ধ হলে বা রিয়েল ডিসকানেক্ট হলে
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft AFK Bot] Disconnected. Reason: ${reason}. Retrying in 10 seconds...`);
        isBotSpawned = false;
        mcBot = null; 
        updateVoiceChannel(); 
        
        setTimeout(createMinecraftBot, 10000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft AFK Bot] Error encountered:', err.message);
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
      // সার্ভার একচুয়ালি অফলাইন বা বট ডিসকানেক্টেড থাকলে
      newName = `🔴┊𝐌𝐂-𝐒𝐄𝐑𝐕𝐄𝐑 : Offline`;
    }

    // নাম যদি ইতিমধ্যে বর্তমান নামের সাথে হুবহু মিলে যায়, তবে কোনো রিকোয়েস্ট পাঠানো হবে না
    if (lastStatus !== newName) {
      try {
        await channel.setName(newName);
        lastStatus = newName;
        console.log(`[Status Counter] Voice channel updated to: "${newName}"`);
      } catch (err) {
        console.error('[Discord Error] Failed to set channel name:', err.message);
      }
    }
  } catch (error) {
    console.error('[Discord Error] Channel fetch or update error:', error.message);
  }
}

// ব্যাকগ্রাউন্ড চেকার লুপ: প্রতি ১০ সেকেন্ড পর পর চেক করবে, স্ট্যাটাস এক থাকলে হাত দেবে না
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
