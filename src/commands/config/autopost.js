const { SlashCommandBuilder } = require("@discordjs/builders");
const { Message, Client, ApplicationCommand, Constants, Permissions, CommandInteraction, ApplicationCommandManager, MessageActionRow, MessageSelectMenu } = require("discord.js");
const { BulkWriteError } = require("mongodb");
const { execute } = require("../../util/intervals/autoupdate");
const validIntervals = ['weekly', 'daily', 'hourly'];
const validCommands = ['weekly', 'monthly', 'daily', 'member', 'leaderboard', 'list', 'guild'];
const yes = ['yes', 'true', 'y', '1', 'ye', 'yep', 'yea', 'yeah', 'on', 'enable'];
const no = ['no', 'n', 'false', '0', 'nope', 'nah', 'na', 'nop', 'off', 'disable'];
const getCommand = (bot, commandName) => bot.commands.get(commandName) || bot.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));


const capitalize = ([firstLetter, ...restOfWord]) =>
    firstLetter.toUpperCase() + restOfWord.join('')
const getNextTime = (type) => {
    var d = new Date();
    if (type == "daily") {
        d.setHours(23, 59, 0, 0);
    } else if (type == "hourly") {
        d.setHours(d.getHours() + 1);
        d.setMinutes(0, 0, 0);
    } else if (type == "weekly") {
        d.setDate(d.getDate() - d.getDay() + 7 + 0);
        d.setHours(23, 59, 0, 0);
    }
    return d.getTime();
}
module.exports = {
    name: "autopost",
    aliases: ["ap", "autocommand", "ac"],
    cooldown: 1,
    description: "Auto Post allows the bot to send a set command on a configurable interval.",
    usage: '[info|setcmd|setchannel|setinterval|edit|delete|reset]',
    example: "setcommand 1 g!daily Rebel all",
    type: 'config',
    adminOnly: true,
    slash: new SlashCommandBuilder()
        .setName('autopost')
        .setDescription('Autopost guild commands on a set interval.')
        .addSubcommand(subcmd =>
            subcmd
                .setName('view')
                .setDescription('View current autopost config'))
        .addSubcommand(subcmd =>
            subcmd
                .setName('info')
                .setDescription('Get info on autopost.'))
        .addSubcommand(subcmd =>
            subcmd
                .setName('setcommand')
                .setDescription('Set autopost command.')
                .addIntegerOption(option =>
                    option
                        .setName('slot')
                        .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }, { name: '5', value: 5 }, { name: '6', value: 6 })
                        .setDescription('Slot to set.')
                        .setRequired(true))

        )
        .addSubcommand(subcmd =>
            subcmd
                .setName('set')
                .setDescription('Set autopost settings.')
                .addIntegerOption(option =>
                    option
                        .setName('slot')
                        .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }, { name: '5', value: 5 }, { name: '6', value: 6 })
                        .setDescription('Slot to set.')
                        .setRequired(true))
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel to send the autopost in')
                        .addChannelTypes(Constants.ChannelTypes.GUILD_TEXT))
                .addStringOption(option =>
                    option
                        .setName('interval')
                        .setDescription('Interval to set.')
                        .addChoices({ name: 'hourly', value: 'hourly' }, { name: 'daily', value: 'daily' }, { name: 'weekly', value: 'weekly' }))
                .addBooleanOption(option =>
                    option
                        .setName('editlastmessage')
                        .setDescription('Edit the message instead of creating a new one.')))
        .addSubcommand(subcmd =>
            subcmd
                .setName('delete')
                .setDescription('Delete autopost slot.')
                .addIntegerOption(option =>
                    option
                        .setName('slot')
                        .addChoices({ name: '1', value: 1 }, { name: '2', value: 2 }, { name: '3', value: 3 }, { name: '4', value: 4 }, { name: '5', value: 5 }, { name: '6', value: 6 })
                        .setDescription('Slot to delete.')
                        .setRequired(true)))
        .addSubcommand(subcmd =>
            subcmd
                .setName('reset')
                .setDescription('Reset autopost config.')),

    /**
     * 
     * @param {CommandInteraction} interaction 
     * @param {Client} bot 
     */
    async run(interaction, { serverConf }, bot) {
        const subcmd = interaction.options.getSubcommand();
        if (subcmd === 'view') {

            let description = `Use **/autopost info** for a list of valid subcommands.\n`;
            let fields = [];
            for (prop in serverConf.autoPost) {
                let autoPost = serverConf.autoPost[prop];
                fields.push({
                    name: `» ${autoPost.name}`, value: `
\`+\` Command: ${autoPost.slashCommand ? `\`${autoPost.slashCommand}\`` : autoPost.command ? `\`/${autoPost.command}\`` : `\`Unset!\``}
\`+\` Channel: ${autoPost.channel ? `<#${autoPost.channel}>` : `\`Unset!\``}
\`+\` Interval: ${autoPost.intervalType ? `**${capitalize(autoPost.intervalType)}** (next <t:${Math.floor(getNextTime(autoPost.intervalType) / 1000)}:R>)` : `\`Unset!\``}
\`+\` Edit Last Message: ${autoPost.doEditMessage ? `**Yes** ✅` : `**No** ❌`}
`, inline: false
                })
            }
            const embed = () => bot.createEmbed(interaction)
                .setFancyGuild()
                .setTitle(`Current AutoPost Config`)
                .setDescription(description)
                .addFields([fields[0]])

            const components = (slotName) => [
                new MessageActionRow()
                    .addComponents(
                        new MessageSelectMenu()
                            .setCustomId('autopost')
                            .setOptions(Object.values(serverConf.autoPost).map(e => ({ default: slotName === e.name, label: `${e.name} ${e.command || e.slashCommand ? `: ${e.command || e.slashCommand}` : ''}`, value: e.name, description: e.slashCommand || e.command ? `Interval: ${e.intervalType ? `${e.intervalType}` : 'Unset'}` : 'Unset!' })))
                    )
            ]
            const pages = await interaction.reply({
                fetchReply: true,
                embeds: [embed()],
                components: components('Slot 1')
            })
            const collector = pages.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, idle: 60000 });
            collector.on('collect', async i => {
                if (i.customId === 'autopost') {
                    const slot = serverConf.autoPost[Object.keys(serverConf.autoPost).findIndex(key => serverConf.autoPost[key].name === i.values[0]) + 1];
                    console.log(slot)
                    await i.update({ embeds: [embed().setFields([fields[Object.keys(serverConf.autoPost).findIndex(key => serverConf.autoPost[key].name === i.values[0])]])], components: components(slot.name) })


                }
            })

        } else if (subcmd === 'info') {
            bot.createEmbed(interaction).setTitle(`AutoPost Info`).setFancyGuild().setDescription(
                `Auto Post allows the bot to send a set command on a configurable interval.

**Valid Subcommands:**
• </autopost info:${interaction.commandId}> - \`Shows this embed.\`
• </autopost set:${interaction.commandId}> - \`Set slot config.\`
• </autopost delete:${interaction.commandId}> - \`Deletes an AutoPost slot.\`
• </autopost reset:${interaction.commandId}> - \`Resets ALL AutoPost configurations.\`

**Valid Intervals:**
• \`weekly\` - Sends command weekly at \`11:59PM\` Sunday night.
• \`daily\` - Sends command daily at \`11:59PM\`.
• \`hourly\` - Sends command at the start of every hour.

**Valid Commands**
• \`guild\` - General guild stats.
• \`member\` - GEXP stats of a given user.
• \`list\` - A list of members in a guild.
• \`daily\` - Daily GEXP stats.
• \`weekly\` - Weekly GEXP stats.
• \`monthly\` - Monthly GEXP stats.
• \`leaderboard\` - Leaderboard position of a guild.

`
            ).send()
        } else if (subcmd === 'setcommand') {
            /**
             * @type {Collection<import("discord.js").Snowflake,ApplicationCommand>}
             */
            const slashCmds = await bot.application.commands.fetch();
            const getCmdStr = (cmd) => {
                const slash = slashCmds.find(n => n.name === cmd);
                return `</${slash.name}:${slash.id}>`
            }

            /**
             * 
             * @param {CommandInteraction} cmd 
            */
            const slot = interaction.options.getInteger('slot', true);
            const tempConfig = bot.tempUserConfig.get(interaction.user.id) || {};
            const callback = (cmd) => {
                const { commandName, } = cmd;
                const slotObject = serverConf.autoPost[`${slot}`];
                let newSlot = {};

                const commandObj = bot.commands.get(commandName);

                if (!validCommands.includes(commandName)) return bot.createErrorEmbed(cmd)
                    .setFancyGuild()
                    .setDescription(`\`${commandName}\` is not a **valid AutoPost command**!\n\n**Valid Commands:**\n•${getCmdStr('guild')} - General guild stats.\n• ${getCmdStr('weekly')} - Weekly GEXP stats.\n• ${getCmdStr('daily')} - Daily GEXP stats.\n• ${getCmdStr('monthly')} - Monthly GEXP stats.\n• ${getCmdStr('member')} - GEXP stats of a given user.\n• ${getCmdStr('list')} - A list of members in a guild.`)
                    .send()

                let commandText = cmd.toString();
                newSlot.slashCommand = commandText;
                newSlot.author = interaction.user.id;

                bot.config.autoPost.setSlot(interaction.guild.id, slot, newSlot);

                return bot.createSuccessEmbed(cmd)
                    .setTitle(`✅ Command Set!`)
                    .setDescription(`\`•\` **Command**: ${slotObject.command ? `\`${slotObject.command}\`` : slotObject.slashCommand ? `\`${slotObject.slashCommand}\`` : `\`Unset!\``} → \`${commandText}\`\n`)
                    .send()
            }

            tempConfig.autopost = {
                callback: callback
            }
            bot.tempUserConfig.set(interaction.user.id, tempConfig);
            bot.createEmbed(interaction)
                .setTitle(`Slot ${slot}: Waiting for AutoPost command... `)
                .setDescription(`*The next command you send will be set as your AutoPost command!*\n\n**Valid Commands:**\n•${getCmdStr('guild')} - General guild stats.\n• ${getCmdStr('weekly')} - Weekly GEXP stats.\n• ${getCmdStr('daily')} - Daily GEXP stats.\n• ${getCmdStr('monthly')} - Monthly GEXP stats.\n• ${getCmdStr('member')} - GEXP stats of a given user.\n• ${getCmdStr('list')} - A list of members in a guild.`)
                .setFooter(`Please send the command you want the bot to post now:`)
                .setColor('YELLOW')
                .send();

        } else if (subcmd === 'set') {
            const slot = interaction.options.getInteger('slot', true);
            const channel = interaction.options.getChannel('channel');
            const interval = interaction.options.getString('interval');
            const doEditMessage = interaction.options.getBoolean('editlastmessage');
            console.log(`doedditmessage`, doEditMessage)
            let text = ``;
            const newSlot = {};
            const slotObject = serverConf.autoPost[`${slot}`];
            if (channel) {
                newSlot.channel = channel.id;
                text += `\`•\` **Channel**: ${slotObject.channel ? `<#${slotObject.channel}>` : `\`Unset!\``} → <#${channel.id}>\n`;
            }
            if (interval) {
                newSlot.intervalType = interval;
                text += `\`•\` **Interval**: ${slotObject.intervalType ? `\`${capitalize(slotObject.intervalType)}\`` : `\`Unset!\``} → \`${interval}\` (next <t:${Math.floor(getNextTime(interval) / 1000)}:R>)\n`;
            }
            if (doEditMessage !== null) {
                newSlot.doEditMessage = doEditMessage;
                text += `\`•\` **Edit Last Message**: ${slotObject.doEditMessage ? `**Yes**` : `**No**`} → **${doEditMessage ? 'Yes' : 'No'}**\n`;
            }
            bot.createEmbed(interaction)
                .setDescription(`**Slot ${slot}** was successfully edited!\n\n${text}`)
                .setFancyGuild()
                .send();

            bot.config.autoPost.setSlot(interaction.guild.id, slot, newSlot);

        } else if (subcmd === 'delete') {
            const slot = interaction.options.getInteger('slot', true);
            bot.config.autoPost.deleteSlot(interaction.guild.id, slot);
            bot.createEmbed(interaction)
                .setDescription(`**Slot ${slot}** was successfully deleted!`)
                .setFancyGuild()
                .send();

        } else if (subcmd === 'reset') {
            bot.config.autoPost.delete(interaction.guild.id);
            bot.createEmbed(interaction)
                .setDescription(`All AutoPost configurations were successfully reset!`)
                .setFancyGuild()
                .send();
        }
    },
    /**
*
* @param {Message} message 
* @param {String[]} args 
* @param {Client} bot 
*/
    async execute(message, args, bot) {
        // console.log(message.serverConf.autoPost)
        if (!args.length) {
            let description = `Use **${message.prefix}autopost info** for a list of valid subcommands.\n`;
            let fields = [];
            for (prop in message.serverConf.autoPost) {
                let autoPost = message.serverConf.autoPost[prop];
                fields.push({
                    name: `» ${autoPost.name}`, value: `
\`+\` Command: ${autoPost.command ? `\`${message.prefix}${autoPost.command}\`` : `\`Unset!\``}
\`+\` Channel: ${autoPost.channel ? `<#${autoPost.channel}>` : `\`Unset!\``}
\`+\` Interval: ${autoPost.intervalType ? `**${capitalize(autoPost.intervalType)}** (next <t:${Math.floor(getNextTime(autoPost.intervalType) / 1000)}:R>)` : `\`Unset!\``}
\`+\` Edit Last Message: ${autoPost.doEditMessage ? `**Yes** ✅` : `**No** ❌`}
`, inline: false
                })

            }
            let embed = bot.createEmbed(message)
                .setFancyGuild()
                .setTitle(`Current AutoPost Config`)
                .setDescription(description)
                .addFields(fields)
                .send()
        } else if (args[0].toLowerCase() == "help" || args[0].toLowerCase() == "info") {
            bot.createEmbed(message).setTitle(`AutoPost Info`).setFancyGuild().setDescription(
                `Auto Post allows the bot to send a set command on a configurable interval.

**Valid Subcommands:**
• \`${message.prefix}autopost info\` - Shows this embed.
• \`${message.prefix}autopost setcommand <Slot> <Command>\` - Assign command.
• \`${message.prefix}autopost setchannel <Slot> <#Channel>\` - Assign channel.
• \`${message.prefix}autopost setinterval <Slot> <Interval>\` - Assign Interval (See **Valid Intervals**).
• \`${message.prefix}autopost edit <Slot> <Yes/No>\` - Should the bot edit the previous message or send a new one?.
• \`${message.prefix}autopost delete <Slot>\` - Deletes an AutoPost slot.
• \`${message.prefix}autopost reset\` - Resets ALL AutoPost configurations.

**Valid Intervals:**
• \`weekly\` - Sends command weekly at \`11:59PM\` Sunday night.
• \`daily\` - Sends command daily at \`11:59PM\`.
• \`hourly\` - Sends command at the start of every hour.

**Valid Commands**
• \`${message.prefix}guild\` - General guild stats.
• \`${message.prefix}member\` - GEXP stats of a given user.
• \`${message.prefix}list\` - A list of members in a guild.
• \`${message.prefix}daily\` - Daily GEXP stats.
• \`${message.prefix}weekly\` - Weekly GEXP stats.
• \`${message.prefix}monthly\` - Monthly GEXP stats.
• \`${message.prefix}leaderboard\` - Leaderboard position of a guild.

`
            ).send()
        } else if (["setcommand", "setcmd"].includes(args[0].toLowerCase())) {
            let slot = parseInt(args[1]);
            if (!args[1] || !args[2]) return bot.createErrorEmbed(message).setDescription(`Invalid Usage: \`${message.prefix}autopost setcommand [Slot] [Command]\``).send()

            if (!slot || slot < 1 || 3 < slot) return bot.createErrorEmbed(message).setDescription(`\`${args[1]}\` is an invalid slot!`).send()

            let commandArgs = args.slice(2, args.length);
            let commandText = commandArgs.join(' ');


            let commandName = commandArgs.shift();
            // console.log(commandArgs, commandText, commandName)
            let command = getCommand(bot, commandName) ? getCommand(bot, commandName) : getCommand(bot, commandName.slice(message.prefix.length, commandName.length));
            if (!command || !command.autoPost) return bot.createErrorEmbed(message).setFancyGuild().setDescription(`\`${commandName}\` is not a **valid AutoPost command**! Try again with a valid command.\n\n**Valid Commands:**\n• \`weekly\` - Weekly GEXP stats.\n• \`daily\` - Daily GEXP stats.\n• \`monthly\` - Monthly GEXP stats.\n• \`member\` - GEXP stats of a given user.\n• \`leaderboard\` - Leaderboard position of a guild (Must be top 1,000).\n• \`list\` - A list of members in a guild.`).send()
            // console.log(commandName.slice(message.prefix.length, commandName.length))
            let slotObject = message.serverConf.autoPost[`${slot}`];
            // a = ['ef'].concat(a)
            let realCommandText = [command.name].concat(commandArgs).join(' ');
            bot.config.autoPost.setSlot(message.guild.id, `${slot}`, { command: realCommandText, author: message.author.id });
            console.log(realCommandText)

            bot.createEmbed(message).setTitle(`Success!`).setDescription(`**${slotObject.name}** command was successfully changed.\n\n\`${slotObject.command ? `${message.prefix}${slotObject.command}` : 'None'}\` → \`${message.prefix}${realCommandText}\``).send()
        } else if (["setchannel", "channel"].includes(args[0].toLowerCase())) {
            let slot = parseInt(args[1]);
            if (!args[1] || !args[2]) return bot.createErrorEmbed(message).setDescription(`Invalid Usage: \`${message.prefix}autopost setchannel [Slot] [#Channel]\``).send()
            if (!slot || slot < 1 || 3 < slot) return bot.createErrorEmbed(message).setDescription(`\`${args[1]}\` is an invalid slot!`).send()
            let _channel = args.slice(2, args.length).join(' ');

            let channel = await bot.parseChannel(_channel, message.guild);
            if (!channel || channel.type !== "GUILD_TEXT") return bot.createErrorEmbed(message).setDescription(`\`${_channel}\` is not a valid \`Channel Name\`, \`ID\`, or \`#Mention\`!`).send()

            let slotObject = message.serverConf.autoPost[`${slot}`];

            bot.config.autoPost.setSlot(message.guild.id, slot, { channel: channel.id });
            bot.createEmbed(message).setTitle(`Success!`).setDescription(`**${slotObject.name}** channel was successfully changed.\n\n${slotObject.channel ? `<#${slotObject.channel}>` : '`None`'} → ${channel}`).send()

        } else if (["setinterval", "interval"].includes(args[0].toLowerCase())) {
            let slot = parseInt(args[1]);
            if (!args[1] || !args[2]) return bot.createErrorEmbed(message).setDescription(`Invalid Usage: \`${message.prefix}autopost setinterval [Slot] [weekly|daily|hourly]\``).send()

            if (!slot || slot < 1 || 3 < slot) return bot.createErrorEmbed(message).setDescription(`\`${args[1]}\` is an invalid slot!`).send()

            let intervalType = args[2].toLowerCase();
            if (!validIntervals.includes(intervalType)) return bot.createErrorEmbed(message).setDescription(`\`${intervalType}\` is not a valid **Interval Type**.\n\n**Valid Interval Types:**\n\• \`weekly\` - Sends command weekly at \`11:59PM\` Sunday night.\n• \`daily\` - Sends command daily at \`11:59PM\`.\n• \`hourly\` - Sends command at the start of every hour.`).send()

            let slotObject = message.serverConf.autoPost[slot];


            bot.config.autoPost.setSlot(message.guild.id, slot, { intervalType: intervalType })
            bot.createEmbed(message).setTitle(`Success!`).setDescription(`**${slotObject.name}** will now auto post **${intervalType}**.\n\n${slotObject.intervalType ? `\`${slotObject.intervalType}\`` : '`None`'} → \`${intervalType}\``).send()


        } else if (["edit", "doedit", "editmessage", "editmsg"].includes(args[0].toLowerCase())) {
            let slot = parseInt(args[1]);
            if (!args[1] || !args[2]) return bot.createErrorEmbed(message).setDescription(`Invalid Usage: \`${message.prefix}autopost edit [Slot] [yes/no]\``).send()

            if (!slot || slot < 1 || 3 < slot) return bot.createErrorEmbed(message).setDescription(`\`${args[1]}\` is an invalid slot!`).send()

            let doEditMessage = yes.includes(args[2].toLowerCase());
            let slotObject = message.serverConf.autoPost[slot];

            bot.config.autoPost.setSlot(message.guild.id, slot, { doEditMessage: doEditMessage });
            bot.createEmbed(message).setTitle(`✅ Success!`).setDescription(`**${slotObject.name}** will now ${doEditMessage ? "**edit** the last message" : "**send** a new message"}.\n\n${slotObject.doEditMessage ? `✅` : '❌'} → ${doEditMessage ? '✅' : '❌'}`).send()

        } else if (["delete", "remove"].includes(args[0].toLowerCase())) {
            let slot = parseInt(args[1]);
            if (!args[1]) return bot.createErrorEmbed(message).setDescription(`Invalid Usage: \`${message.prefix}autopost delete [Slot]\``).send()

            if (!slot || slot < 1 || 3 < slot) return bot.createErrorEmbed(message).setDescription(`\`${args[1]}\` is an invalid slot!`).send()
            let slotObject = message.serverConf.autoPost[slot];

            await bot.config.autoPost.deleteSlot(message.guild.id, slot);
            bot.createEmbed(message).setTitle(`Success!`).setDescription(`**${slotObject && slotObject.name}** has been deleted.`).send();
        } else if (args[0].toLowerCase() == "reset") {
            bot.config.autoPost.delete(message.guild.id);
            bot.createEmbed(message).setAuthor(message.guild.name, message.guild.iconURL()).setTitle(`Success!`).setDescription(`AutoPost configurations has been reset!`).send()

        } else {
            return bot.createErrorEmbed(message).setDescription(`\`${args[0]}\` is not a valid AutoPost subcommand!\n\n Use \`${message.prefix}autopost info\` for a list of valid subcommands!`).send()
        }
    }
}