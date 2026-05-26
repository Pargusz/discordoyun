const { Client, GatewayIntentBits, Partials } = require('discord.js');

async function createDiscordBot(token, guildId, channelId, onCommand) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel]
  });

  return new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Discord bot bağlantısı zaman aşımına uğradı (30s). Token ve izinleri kontrol edin.'));
    }, 30000);

    client.once('ready', async () => {
      clearTimeout(timeout);
      console.log(`✅ Bot hazır: ${client.user.tag}`);

      try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) {
          reject(new Error('Sunucu bulunamadı. Guild ID\'yi kontrol edin.'));
          return;
        }

        // Fetch all members
        await guild.members.fetch();
        const membersRaw = guild.members.cache;

        const members = [];
        membersRaw.forEach(member => {
          if (member.user.bot) return; // skip bots

          // Determine monster type based on permissions/roles
          let monsterType = 'goblin';
          let power = 1;

          if (member.permissions.has('Administrator')) {
            monsterType = 'dragon'; // Admin = Dragon Boss
            power = 5;
          } else if (member.permissions.has('ManageGuild') || member.permissions.has('ManageChannels')) {
            monsterType = 'orc'; // Moderator = Orc Elite
            power = 3;
          } else if (member.roles.cache.size > 2) {
            monsterType = 'skeleton'; // Has multiple roles = Skeleton Warrior
            power = 2;
          } else {
            // Regular member - random type
            const types = ['goblin', 'slime', 'bat', 'zombie', 'spider'];
            monsterType = types[Math.floor(Math.random() * types.length)];
            power = 1;
          }

          const avatarURL = member.user.displayAvatarURL({ size: 64, format: 'png' });

          members.push({
            id: member.id,
            username: member.displayName || member.user.username,
            discriminator: member.user.discriminator,
            avatarURL,
            monsterType,
            power,
            roles: member.roles.cache.map(r => r.name).filter(n => n !== '@everyone')
          });
        });

        // Shuffle members for random encounter order
        members.sort(() => Math.random() - 0.5);

        // Listen to channel messages
        client.on('messageCreate', (message) => {
          if (message.channelId !== channelId) return;
          if (message.author.bot) return;

          const content = message.content.trim();
          const validCommands = ['1', '2', '3', '4'];
          if (validCommands.includes(content)) {
            onCommand(content, message.author.username);
          }
        });

        resolve({ client, members });

      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Discord hatası: ${err.message}`));
    });

    try {
      await client.login(token);
    } catch (err) {
      clearTimeout(timeout);
      reject(new Error(`Token geçersiz veya bot izinleri eksik: ${err.message}`));
    }
  });
}

async function destroyBot(client) {
  if (client) {
    client.destroy();
  }
}

module.exports = { createDiscordBot, destroyBot };
