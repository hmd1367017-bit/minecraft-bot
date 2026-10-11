require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');

// Environment Variables Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MC_HOST = process.env.MC_HOST || 'axccorporation.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 25337;
const MC_USERNAME = process.env.MC_USERNAME || 'DiscordBot';

// Discord Client Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let mcBot = null;

function createMinecraftBot() {
    console.log(`[Minecraft] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        auth: 'offline'
        // 'version' লাইনটি এখান থেকে সম্পূর্ণ মুছে দেওয়া হয়েছে, যাতে এটি অটো-ডিটেক্ট করতে পারে
    });

    // বট গেমের ভেতর সম্পূর্ণ লোড হওয়ার পর
    mcBot.once('spawn', () => {
        console.log('[Minecraft] Bot successfully spawned in world!');

        // Anti-AFK: প্রতি ৩ মিনিট পরপর একবার লাফাবে
        const afkInterval = setInterval(() => {
            if (mcBot && mcBot.entity) {
                mcBot.setControlState('jump', true);
                setTimeout(() => {
                    if (mcBot) mcBot.setControlState('jump', false);
                }, 500);
            } else {
                clearInterval(afkInterval);
            }
        }, 180000);
    });

    // কিক বা ডিসকানেক্ট হলে রিকানেক্ট করা
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft] Bot disconnected (Reason: ${reason}). Reconnecting in 15 seconds...`);
        mcBot = null;
        setTimeout(createMinecraftBot, 15000);
    });

    mcBot.on('error', (err) => {
        console.error('[Minecraft] Error encountered:', err.message);
    });
}

// Discord Client Event Handlers
client.once('ready', () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  createMinecraftBot();
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!status') {
    if (mcBot && mcBot.player) {
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
