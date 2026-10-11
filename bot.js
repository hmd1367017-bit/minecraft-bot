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
    version: '1.20.3'
});

  mcBot.on('spawn', () => {
    console.log('[Minecraft] Bot successfully joined the server!');
    
    // Anti-AFK Kick Mechanism (Anti-idle jump every 5 minutes)
    setInterval(() => {
      if (mcBot) {
        mcBot.setControlState('jump', true);
        setTimeout(() => mcBot.setControlState('jump', false), 500);
      }
    }, 300000);
  });

  mcBot.on('end', () => {
    console.log('[Minecraft] Bot disconnected. Reconnecting in 10 seconds...');
    setTimeout(createMinecraftBot, 10000);
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
