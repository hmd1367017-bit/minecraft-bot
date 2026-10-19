require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const net = require('net');

// Environment Variables Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID; // এনভায়রনমেন্ট ভেরিয়েবল থেকে আইডি নেবে
const MC_HOST = process.env.MC_HOST || 'bdtopsmp.aternos.me';
const MC_PORT = parseInt(process.env.MC_PORT, 10) || 48115;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastStatus = null;

client.once('ready', () => {
  console.log(`[Player Counter Bot] Logged in successfully as ${client.user.tag}`);
  
  // চালু হওয়ার সাথে সাথে চেক করবে, এরপর প্রতি ১০ সেকেন্ড পর পর
  checkMinecraftServer();
  setInterval(checkMinecraftServer, 10000);
});

function checkMinecraftServer() {
  const socket = new net.Socket();
  let buffer = Buffer.alloc(0);
  let isConnected = false;

  socket.setTimeout(4000); // ৪ সেকেন্ড টাইমআউট

  socket.connect(MC_PORT, MC_HOST, () => {
    isConnected = true;
    
    // Minecraft Server List Ping Handshake Packet
    const hostBuffer = Buffer.from(MC_HOST, 'utf8');
    const packetData = Buffer.concat([
      Buffer.from([0x00]), // Packet ID: Handshake
      writeVarInt(47),     // Protocol Version
      writeVarInt(hostBuffer.length),
      hostBuffer,
      Buffer.from(toBytes(MC_PORT, 2)), // Port
      Buffer.from([0x01])  // Next State: 1 (Status)
    ]);

    const handshake = Buffer.concat([writeVarInt(packetData.length), packetData]);
    const request = Buffer.from([0x01, 0x00]); // Request Packet

    socket.write(Buffer.concat([handshake, request]));
  });

  socket.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);
    try {
      const packetLength = readVarInt(buffer);
      if (buffer.length < packetLength.length + packetLength.value) return;

      const jsonString = buffer.toString('utf8', packetLength.length + 1);
      const jsonResponse = JSON.parse(jsonString);

      const onlinePlayers = jsonResponse.players && typeof jsonResponse.players.online === 'number' 
        ? jsonResponse.players.online 
        : 0;

      // আপনার কাঙ্ক্ষিত ফরম্যাট: Online - সংখ্যা
      updateVoiceChannel(`🔵┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Online - ${onlinePlayers}`);
      socket.destroy();
    } catch (e) {
      // পার্সিং এরর ইগ্নোর করার জন্য
    }
  });

  socket.on('error', (err) => {
    if (!isConnected) {
      socket.destroy();
      updateVoiceChannel(`🔴┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Offline`);
    }
  });

  socket.on('timeout', () => {
    if (!isConnected) {
      socket.destroy();
      updateVoiceChannel(`🔴┊𝐌𝐂-𝐏𝐋𝐀𝐘𝐄𝐑 : Offline`);
    }
  });
}

async function updateVoiceChannel(newName) {
  try {
    if (!VOICE_CHANNEL_ID) {
      console.error('[Error] VOICE_CHANNEL_ID is missing in Environment Variables!');
      return;
    }

    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel) return;

    if (lastStatus !== newName) {
      await channel.setName(newName);
      lastStatus = newName;
      console.log(`[Success] Voice channel updated to: "${newName}"`);
    }
  } catch (error) {
    console.error('[Discord Error] Failed to update voice channel:', error.message);
  }
}

// Helper Functions for Minecraft Protocol Handling
function writeVarInt(value) {
  const bytes = [];
  while (true) {
    if ((value & ~0x7F) === 0) {
      bytes.push(value);
      break;
    }
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer) {
  let numRead = 0;
  let result = 0;
  let read;
  do {
    read = buffer[numRead];
    result |= (read & 0x7F) << (7 * numRead);
    numRead++;
    if (numRead > 5) throw new Error('VarInt is too big');
  } while ((read & 0x80) === 0x80);
  return { value: result, length: numRead };
}

function toBytes(number, bytes) {
  const buf = new Array(bytes);
  for (let i = bytes - 1; i >= 0; i--) {
    buf[i] = number & 0xff;
    number = number >> 8;
  }
  return buf;
}

if (!DISCORD_TOKEN) {
  console.error('[Fatal Error] DISCORD_TOKEN is missing!');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
