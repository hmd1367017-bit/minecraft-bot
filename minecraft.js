require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const net = require('net');

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
  checkServerAndStatus();
  setInterval(checkServerAndStatus, 10000);
});

function checkServerAndStatus() {
  console.log('[Status Check] Checking Minecraft server connection...');
  
  const socket = new net.Socket();
  let isConnected = false;

  socket.setTimeout(4000); // ৪ সেকেন্ড টাইমআউট

  socket.connect(MC_PORT, MC_HOST, () => {
    isConnected = true;
    socket.destroy();
    // সার্ভার ওপেন আছে, এবার প্লেয়ার কাউন্টের জন্য মাইনক্রাফট প্রোটোকল হ্যান্ডেল করব অথবা সরাসরি স্ট্যাটাস আপডেট করব
    // যেহেতু এটার পোর্ট খোলা মানে সার্ভার অনলাইন, আমরা সিম্পলি অনলাইন স্ট্যাটাস বা প্লেয়ার কাউন্ট দেখাতে পারি।
    updateVoiceChannel('online');
  });

  socket.on('error', (err) => {
    if (!isConnected) {
      socket.destroy();
      updateVoiceChannel('offline');
    }
  });

  socket.on('timeout', () => {
    if (!isConnected) {
      socket.destroy();
      updateVoiceChannel('offline');
    }
  });
}

async function updateVoiceChannel(status) {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) {
      console.error(`[Error] Voice channel with ID ${VOICE_CHANNEL_ID} was not found!`);
      return;
    }

    let newName = '';
    if (status === 'online') {
      // সার্ভার অন থাকলে আপাতত সাধারণ অনলাইন ইন্ডিকেটর বা প্লেয়ার কাউন্ট দেখাবে
      newName = `🔵┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Online`;
    } else {
      newName = `🔴┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Offline`;
    }

    if (lastStatus !== newName) {
      await channel.setName(newName);
      lastStatus = newName;
      console.log(`[Success] Voice channel name updated to: "${newName}"`);
    }
  } catch (error) {
    console.error('[Discord Error] Failed to update voice channel:', error.message);
  }
}

if (!DISCORD_TOKEN) {
  console.error('[Fatal Error] DISCORD_TOKEN is missing in Environment Variables!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
