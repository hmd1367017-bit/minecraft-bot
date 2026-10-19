require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');

// Environment Variables Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID; // আপনার ভয়েস চ্যানেল আইডি
const MC_HOST = process.env.MC_HOST || 'bdtopsmp.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 48115;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastStatus = null;

client.once('ready', () => {
  console.log(`[Player Counter Bot] Logged in successfully as ${client.user.tag}`);
  
  // প্রথমবার চালু হওয়ার সাথে সাথে একবার চেক করবে, এরপর প্রতি ১০ সেকেন্ড পর পর
  updateVoiceChannelStatus();
  setInterval(updateVoiceChannelStatus, 10000);
});

async function updateVoiceChannelStatus() {
  console.log('[Status Check] Checking Minecraft server status...');
  
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) {
      console.error(`[Error] Voice channel with ID ${VOICE_CHANNEL_ID} was not found! Please check the ID.`);
      return;
    }

    // Mineflayer দিয়ে সার্ভার পিং করা
    mineflayer.ping({ host: MC_HOST, port: MC_PORT }, async (err, response) => {
      if (err) {
        console.warn(`[Server Offline] Could not reach ${MC_HOST}:${MC_PORT}. Reason: ${err.message}`);
        setOfflineStatus(channel);
        return;
      }

      const onlinePlayers = response.players.online;
      const maxPlayers = response.players.max;
      const newName = `🔵┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : ${onlinePlayers}`;

      console.log(`[Server Online] Players online: ${onlinePlayers}/${maxPlayers}`);

      if (lastStatus !== newName) {
        try {
          await channel.setName(newName);
          lastStatus = newName;
          console.log(`[Success] Voice channel name updated to: "${newName}"`);
        } catch (renameErr) {
          console.error('[Discord Error] Failed to rename voice channel. Check if the bot has "Manage Channels" permission and its role is above the voice channel!', renameErr.message);
        }
      }
    });
  } catch (error) {
    console.error('[Critical Error] Error in updateVoiceChannelStatus:', error.message);
  }
}

async function setOfflineStatus(channel) {
  const offlineName = `🔴┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Offline`;

  if (lastStatus !== offlineName && channel) {
    try {
      await channel.setName(offlineName);
      lastStatus = offlineName;
      console.log(`[Success] Server is offline. Voice channel updated to: "${offlineName}"`);
    } catch (renameErr) {
      console.error('[Discord Error] Failed to set offline name on voice channel:', renameErr.message);
    }
  }
}

if (!DISCORD_TOKEN) {
  console.error('[Fatal Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
