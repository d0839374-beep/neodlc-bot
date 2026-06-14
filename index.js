require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const dashboard = require('./dashboard');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN не найден в .env!');
  process.exit(1);
}
console.log('✅ Токен загружен');

const configPath = path.join(__dirname, 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch {
  config = {
    welcomeChannelId: '',
    memberRoleId: '',
    unverifiedRoleId: '',
    welcomeEnabled: true,
    welcomeMessage: 'Добро пожаловать, {user}, на сервер!',
    ticketEnabled: false,
    ticketChannelId: '',
    ticketCategoryId: '',
    ticketMessageId: null,
    verifyEnabled: false,
    verifyChannelId: '',
    verifiedRoleId: '',
    verifyMessageId: null,
    moderationEnabled: false,
    moderationRoles: {}
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

const warnings = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// -------- Обновление панели верификации --------
async function updateVerifyPanel() {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!cfg.verifyEnabled || !cfg.verifyChannelId) return;

    const channel = client.channels.cache.get(cfg.verifyChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('🛡️ Верификация')
      .setDescription('Нажмите на реакцию ✅ под этим сообщением, чтобы получить доступ к серверу.')
      .setFooter({ text: 'Вы получите роль Verified, а ограничения будут сняты.' });

    if (cfg.verifyMessageId) {
      try {
        const msg = await channel.messages.fetch(cfg.verifyMessageId);
        await msg.edit({ embeds: [embed] });
        if (!msg.reactions.cache.has('✅')) {
          await msg.react('✅');
        }
        return;
      } catch {
        cfg.verifyMessageId = null;
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      }
    }

    const msg = await channel.send({ embeds: [embed] });
    await msg.react('✅');
    cfg.verifyMessageId = msg.id;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error('Ошибка обновления панели верификации:', err);
  }
}

// -------- Обновление тикет-панели --------
async function updateTicketPanel() {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!cfg.ticketEnabled || !cfg.ticketChannelId) return;

    const channel = client.channels.cache.get(cfg.ticketChannelId);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('🎫 Поддержка')
      .setDescription('Нажмите кнопку ниже, чтобы создать тикет.')
      .setFooter({ text: 'Служба поддержки' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('Создать тикет')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📩')
    );

    if (cfg.ticketMessageId) {
      try {
        const msg = await channel.messages.fetch(cfg.ticketMessageId);
        await msg.edit({ embeds: [embed], components: [row] });
        return;
      } catch {
        cfg.ticketMessageId = null;
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
      }
    }

    const msg = await channel.send({ embeds: [embed], components: [row] });
    cfg.ticketMessageId = msg.id;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.error('Ошибка обновления тикет-панели:', err);
  }
}

// -------- КОМАНДЫ (без /tutorial) --------
const commands = [
  new SlashCommandBuilder().setName('ban').setDescription('Забанить участника')
    .addUserOption(o => o.setName('user').setDescription('Участник').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('unban').setDescription('Разбанить по ID')
    .addStringOption(o => o.setName('userid').setDescription('ID пользователя').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('kick').setDescription('Кикнуть участника')
    .addUserOption(o => o.setName('user').setDescription('Участник').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('warn').setDescription('Выдать предупреждение')
    .addUserOption(o => o.setName('user').setDescription('Участник').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warnings').setDescription('Количество предупреждений')
    .addUserOption(o => o.setName('user').setDescription('Участник').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('clear').setDescription('Очистить сообщения')
    .addIntegerOption(o => o.setName('amount').setDescription('Кол-во (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('mute').setDescription('Замутить на время (Timeout)')
    .addUserOption(o => o.setName('user').setDescription('Участник').setRequired(true))
    .addIntegerOption(o => o.setName('minutes').setDescription('Минуты (макс 40320)').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(o => o.setName('reason').setDescription('Причина').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('unmute').setDescription('Снять мут')
    .addUserOption(o => o.setName('user').setDescription('Участник').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('slowmode').setDescription('Медленный режим')
    .addIntegerOption(o => o.setName('seconds').setDescription('Секунды (0=выкл)').setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('lock').setDescription('Закрыть канал для @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('unlock').setDescription('Открыть канал для @everyone')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('banlist').setDescription('Список забаненных')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('Регистрация команд...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Команды зарегистрированы.');
  } catch (err) {
    console.error('Ошибка регистрации команд:', err);
  }
})();

client.on('ready', () => {
  console.log(`Бот ${client.user.tag} запущен!`);
  dashboard({ client, configPath, warnings, updateTicketPanel, updateVerifyPanel });
  updateTicketPanel();
  updateVerifyPanel();
});

// -------- АВТО‑РОЛЬ + ВЕРИФИКАЦИЯ ПРИ ВХОДЕ --------
client.on('guildMemberAdd', async member => {
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { cfg = config; }

  // Member всегда, если задан
  if (cfg.memberRoleId) {
    const memberRole = member.guild.roles.cache.get(cfg.memberRoleId);
    if (memberRole && !memberRole.managed && memberRole.editable) {
      try {
        await member.roles.add(memberRole);
        console.log(`✅ Выдана роль Member "${memberRole.name}" участнику ${member.user.tag}`);
      } catch (e) {
        console.error(`❌ Ошибка выдачи роли Member: ${e.message}`);
      }
    } else {
      console.warn(`⚠️ Роль Member ${cfg.memberRoleId} недоступна.`);
    }
  }

  // Unverified только если верификация включена
  if (cfg.verifyEnabled && cfg.unverifiedRoleId) {
    const unverifiedRole = member.guild.roles.cache.get(cfg.unverifiedRoleId);
    if (unverifiedRole && !unverifiedRole.managed && unverifiedRole.editable) {
      try {
        await member.roles.add(unverifiedRole);
        console.log(`✅ Выдана роль Unverified "${unverifiedRole.name}" участнику ${member.user.tag}`);
      } catch (e) {
        console.error(`❌ Ошибка выдачи Unverified: ${e.message}`);
      }
    } else {
      console.warn(`⚠️ Роль Unverified ${cfg.unverifiedRoleId} недоступна.`);
    }
  }

  // Приветствие
  if (cfg.welcomeEnabled && cfg.welcomeChannelId) {
    const channel = member.guild.channels.cache.get(cfg.welcomeChannelId);
    if (channel?.isTextBased()) {
      const msg = cfg.welcomeMessage.replace('{user}', `<@${member.user.id}>`);
      channel.send(msg).catch(console.error);
    }
  }
});

// -------- ОБРАБОТЧИК КОМАНД + ПРОВЕРКА РОЛЕЙ ПО ОТДЕЛЬНОСТИ --------
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options, guild, member } = interaction;
    if (!guild) return interaction.reply({ content: 'Команды только на сервере.', flags: MessageFlags.Ephemeral });

    // === ПРОВЕРКА РОЛЕЙ МОДЕРАЦИИ ДЛЯ КОНКРЕТНОЙ КОМАНДЫ ===
    const moderationCommands = ['ban', 'unban', 'kick', 'warn', 'warnings', 'clear', 'mute', 'unmute', 'slowmode', 'lock', 'unlock', 'banlist'];
    if (moderationCommands.includes(commandName)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (cfg.moderationEnabled) {
          const allowedRoles = cfg.moderationRoles?.[commandName];
          if (Array.isArray(allowedRoles) && allowedRoles.length > 0) {
            const hasRole = member.roles.cache.some(role => allowedRoles.includes(role.id));
            if (!hasRole) {
              return interaction.reply({ content: '❌ У вас нет разрешённой роли для выполнения этой команды.', flags: MessageFlags.Ephemeral });
            }
          }
        }
      } catch (e) {}
    }

    try {
      if (commandName === 'ban') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'Не указана';
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target) return interaction.reply({ content: 'Участник не найден.', flags: MessageFlags.Ephemeral });
        if (!target.bannable) return interaction.reply({ content: 'Не могу забанить этого участника.', flags: MessageFlags.Ephemeral });
        await target.ban({ reason });
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setDescription(`🔨 ${user.tag} забанен. Причина: ${reason}`)] });
      }

      else if (commandName === 'unban') {
        const userId = options.getString('userid');
        const reason = options.getString('reason') || 'Не указана';
        try {
          await guild.bans.fetch(userId);
          await guild.bans.remove(userId, reason);
          await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`✅ Пользователь с ID \`${userId}\` разбанен. Причина: ${reason}`)] });
        } catch {
          await interaction.reply({ content: `❌ Не удалось разбанить. Проверьте ID и наличие бана.`, flags: MessageFlags.Ephemeral });
        }
      }

      else if (commandName === 'kick') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'Не указана';
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target) return interaction.reply({ content: 'Участник не найден.', flags: MessageFlags.Ephemeral });
        if (!target.kickable) return interaction.reply({ content: 'Не могу кикнуть этого участника.', flags: MessageFlags.Ephemeral });
        await target.kick(reason);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setDescription(`👢 ${user.tag} кикнут. Причина: ${reason}`)] });
      }

      else if (commandName === 'warn') {
        const user = options.getUser('user');
        const reason = options.getString('reason') || 'Не указана';
        if (!warnings.has(guild.id)) warnings.set(guild.id, new Map());
        const guildWarns = warnings.get(guild.id);
        guildWarns.set(user.id, (guildWarns.get(user.id) || 0) + 1);
        const count = guildWarns.get(user.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription(`⚠️ ${user.tag} получил предупреждение #${count}. Причина: ${reason}`)] });
      }

      else if (commandName === 'warnings') {
        const user = options.getUser('user');
        const guildWarns = warnings.get(guild.id);
        const count = guildWarns ? guildWarns.get(user.id) || 0 : 0;
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFFF00).setDescription(`📋 ${user.tag} имеет ${count} предупреждений.`)] });
      }

      else if (commandName === 'clear') {
        const amount = options.getInteger('amount');
        await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `🧹 Удалено ${amount} сообщений.`, flags: MessageFlags.Ephemeral });
      }

      else if (commandName === 'mute') {
        const user = options.getUser('user');
        const minutes = options.getInteger('minutes');
        const reason = options.getString('reason') || 'Не указана';
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target) return interaction.reply({ content: 'Участник не найден.', flags: MessageFlags.Ephemeral });
        if (!target.moderatable) return interaction.reply({ content: 'Не могу замутить этого участника.', flags: MessageFlags.Ephemeral });
        const ms = minutes * 60 * 1000;
        await target.timeout(ms, reason);
        const until = Math.floor((Date.now() + ms) / 1000);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x808080).setDescription(`🔇 ${user.tag} замучен на ${minutes} мин. до <t:${until}:f>. Причина: ${reason}`)] });
      }

      else if (commandName === 'unmute') {
        const user = options.getUser('user');
        const target = await guild.members.fetch(user.id).catch(() => null);
        if (!target) return interaction.reply({ content: 'Участник не найден.', flags: MessageFlags.Ephemeral });
        if (!target.moderatable) return interaction.reply({ content: 'Не могу размутить этого участника.', flags: MessageFlags.Ephemeral });
        await target.timeout(null);
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setDescription(`🔊 ${user.tag} размучен.`)] });
      }

      else if (commandName === 'slowmode') {
        const seconds = options.getInteger('seconds');
        await interaction.channel.setRateLimitPerUser(seconds);
        await interaction.reply({ content: seconds === 0 ? '⏩ Медленный режим отключён.' : `🐢 Медленный режим установлен на ${seconds} сек.`, flags: MessageFlags.Ephemeral });
      }

      else if (commandName === 'lock') {
        const channel = interaction.channel;
        if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Эта команда только для текстовых каналов.', flags: MessageFlags.Ephemeral });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
        await interaction.reply({ content: '🔒 Канал закрыт для @everyone.' });
      }

      else if (commandName === 'unlock') {
        const channel = interaction.channel;
        if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: 'Эта команда только для текстовых каналов.', flags: MessageFlags.Ephemeral });
        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
        await interaction.reply({ content: '🔓 Канал открыт для @everyone.' });
      }

      else if (commandName === 'banlist') {
        const bans = await guild.bans.fetch();
        if (bans.size === 0) return interaction.reply({ content: 'Нет забаненных пользователей.', flags: MessageFlags.Ephemeral });
        const list = bans.map(ban => `\`${ban.user.id}\` – ${ban.user.tag} (причина: ${ban.reason || 'нет'})`).join('\n');
        const embed = new EmbedBuilder().setColor(0xFFFFFF).setTitle('📜 Список банов').setDescription(list.slice(0, 4000));
        await interaction.reply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Ошибка выполнения команды:', err);
      await interaction.reply({ content: '❌ Произошла ошибка. Подробности в консоли.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }

  // Кнопки тикетов
  if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') {
      const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (!cfg.ticketEnabled || !cfg.ticketCategoryId) {
        return interaction.reply({ content: 'Система тикетов не настроена.', flags: MessageFlags.Ephemeral });
      }
      const category = interaction.guild.channels.cache.get(cfg.ticketCategoryId);
      if (!category || category.type !== 4) {
        return interaction.reply({ content: 'Категория не найдена.', flags: MessageFlags.Ephemeral });
      }

      const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      try {
        const ticketChannel = await interaction.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });

        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle('🎫 Тикет создан')
          .setDescription(`Здравствуйте, ${interaction.user}! Опишите ваш вопрос.`)
          .setFooter({ text: 'Для закрытия нажмите кнопку ниже.' });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Закрыть тикет')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒')
        );

        await ticketChannel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `Тикет создан: ${ticketChannel}`, flags: MessageFlags.Ephemeral });
      } catch (err) {
        console.error('Ошибка создания тикета:', err);
        await interaction.reply({ content: 'Не удалось создать тикет.', flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.deferUpdate();
      const channel = interaction.channel;
      if (!channel.name.startsWith('ticket-')) return;
      try {
        await interaction.followUp({ content: 'Тикет будет закрыт через 5 секунд...' });
        setTimeout(async () => {
          try { await channel.delete(); } catch (e) { console.error('Ошибка удаления канала:', e); }
        }, 5000);
      } catch (e) {
        console.error(e);
      }
    }
  }
});

// Обработка реакции для верификации
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch (error) { return; }
  }

  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  if (!cfg.verifyEnabled || !cfg.verifyChannelId || !cfg.verifyMessageId) return;
  if (reaction.message.id !== cfg.verifyMessageId) return;
  if (reaction.emoji.name !== '✅') return;

  const guild = reaction.message.guild;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  const unverifiedRole = cfg.unverifiedRoleId ? guild.roles.cache.get(cfg.unverifiedRoleId) : null;
  const verifiedRole = cfg.verifiedRoleId ? guild.roles.cache.get(cfg.verifiedRoleId) : null;
  if (!unverifiedRole || !verifiedRole) return;

  if (!member.roles.cache.has(unverifiedRole.id)) return;

  try {
    await member.roles.remove(unverifiedRole);
    await member.roles.add(verifiedRole);
    await reaction.users.remove(user.id);
    try {
      await user.send('✅ Верификация пройдена! Добро пожаловать на сервер.');
    } catch (e) {}
  } catch (err) {
    console.error('Ошибка верификации:', err);
  }
});

client.login(process.env.DISCORD_TOKEN);
