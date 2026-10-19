require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const mineflayer = require('mineflayer');

// Environment Variables Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VOICE_CHANNEL_ID = '1561427705713401946'; // আপনার ভয়েস চ্যানেল আইডি
const MC_HOST = process.env.MC_HOST || 'bdtopsmp.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 48115;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastStatus = null;

client.once('ready', () => {
  console.log(`[Player Counter] Logged in as ${client.user.tag}`);
  
  // প্রতি ১০ সেকেন্ড পর পর সার্ভার পিং চেক করবে
  setInterval(updateVoiceChannelStatus, 10000);
});

async function updateVoiceChannelStatus() {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    // Mineflayer এর বিল্ট-ইন পিং ফাংশন দিয়ে সার্ভার চেক করা (কোনো এক্সট্রা প্যাকেজ ছাড়াই)
    mineflayer.ping({ host: MC_HOST, port: MC_PORT }, async (err, response) => {
      if (err) {
        // সার্ভার অফলাইন থাকলে
        setOfflineStatus(channel);
        return;
      }

      const onlinePlayers = response.players.online;
      const newName = `🔵┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : ${onlinePlayers}`;

      if (lastStatus !== newName) {
        await channel.setName(newName);
        lastStatus = newName;
        console.log(`[Status Updated] ${newName}`);
      }
    });
  } catch (error) {
    console.error('[Error] Channel fetch failed:', error.message);
  }
}

async function setOfflineStatus(channel) {
  const offlineName = `🔴┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Offline`;
  if (lastStatus !== offlineName && channel) {
    await channel.setName(offlineName);
    lastStatus = offlineName;
    console.log(`[Status Updated] Server is Offline.`);
  }
}

if (!DISCORD_TOKEN) {
  console.error('[Error] DISCORD_TOKEN is missing!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
