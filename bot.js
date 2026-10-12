require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');

// Environment Variables Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const MC_HOST = process.env.MC_HOST || 'axccorporation.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 25337;
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

function createMinecraftBot() {
    console.log(`[Minecraft] Connecting to ${MC_HOST}:${MC_PORT} as ${MC_USERNAME}...`);

    mcBot = mineflayer.createBot({
        host: MC_HOST,
        port: MC_PORT,
        username: MC_USERNAME,
        version: '1.20.3', // আপনার ভার্সনের সঠিক প্রটোকল ট্যাগ
        auth: 'offline',   // ক্র্যাকড বা Aternos সার্ভারের জন্য আবশ্যক
        checkTimeoutInterval: 60000 // টাইমআউট সময় বাড়িয়ে দেওয়া হলো যাতে সার্ভার সহজে কিক না করে
    });

    // বট সার্ভারে পুরোপুরি প্রবেশ করার পর কোনো নড়াচড়া বা মুভমেন্ট প্যাকেট যেন ত্রুটি না ঘটায়
    mcBot.once('spawn', () => {
        console.log('[Minecraft] Bot successfully spawned in world!');

        // বট স্পন হওয়ার অন্তত ১০ সেকেন্ড পর প্রথম মুভমেন্ট বা জাম্প শুরু করবে
        setTimeout(() => {
            setInterval(() => {
                if (mcBot && mcBot.entity) {
                    mcBot.setControlState('jump', true);
                    setTimeout(() => {
                        mcBot.setControlState('jump', false);
                    }, 500);
                }
            }, 180000); // প্রতি ৩ মিনিট পর পর এন্টি-এএফকে জাম্প
        }, 10000);
    });

    // কিক বা ডিসকানেক্ট হলে যাতে সার্ভার ওভারলোডেড না হয়ে ৫ সেকেন্ড পর স্মুথলি রি-কানেক্ট করে
    mcBot.on('end', (reason) => {
        console.log(`[Minecraft] Bot disconnected. Reason: ${reason}. Reconnecting in 5 seconds...`);
        setTimeout(createMinecraftBot, 5000);
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
