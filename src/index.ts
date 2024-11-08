import {
    APIEmbed,
    APIEmbedField,
    ApplicationCommandOptionType,
    ButtonStyle,
    Client,
    Colors,
    ComponentType,
    Events,
    IntentsBitField,
    MessageCreateOptions,
    PermissionFlagsBits,
    Role,
    TextInputStyle,
} from "discord.js";
import "dotenv/config";
import { GUILD_ROLES, GUILD_TO_ORG, LOG_CHANNELS, ORG_TO_GUILDS } from "./config.ts";

process.on("uncaughtException", (error) => console.error(error));

const bot = new Client({
    intents: IntentsBitField.Flags.Guilds | IntentsBitField.Flags.GuildMessages | IntentsBitField.Flags.GuildMembers,
    allowedMentions: { parse: [] },
});

bot.on(Events.ClientReady, async (client) => {
    await client.application.commands.set([
        {
            name: "on-leave",
            description: "post the on-leave embed",
            dmPermission: false,
            defaultMemberPermissions: PermissionFlagsBits.Administrator,
            options: [
                {
                    type: ApplicationCommandOptionType.String,
                    name: "button-label",
                    description: "the label for the switcher button",
                },
            ],
        },
    ]);
});

bot.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "on-leave") {
            if (interaction.guild === null) return;

            if (!(interaction.guild.id in GUILD_TO_ORG)) {
                await interaction.reply({
                    content: "This server is not configured and you cannot use this bot here.",
                    ephemeral: true,
                });

                return;
            }

            await interaction.deferReply({ ephemeral: true });

            const fields: APIEmbedField[] = [];

            for (const id of ORG_TO_GUILDS[GUILD_TO_ORG[interaction.guild.id]]) {
                const guild = interaction.client.guilds.cache.get(id);

                if (guild === undefined) {
                    await interaction.editReply(`Error: guild with ID ${id} could not be found.`);
                    return;
                }

                fields.push({
                    name: guild.name,
                    value: GUILD_ROLES[id]
                        .map((pair) =>
                            id === interaction.guild!.id
                                ? `<@&${pair[0]}> \`<->\` <@&${pair[1]}>`
                                : `@${guild.roles.cache.get(pair[0])?.name ?? "[unknown role]"} \`<->\` @${
                                      guild.roles.cache.get(pair[1])?.name ?? "[unknown role]"
                                  }`,
                        )
                        .join("\n"),
                });
            }

            const embed: APIEmbed = {
                title: "Switch On-Leave Status",
                description: "Click below to go on or off leave. Feel free to leave the reason and/or duration blank.",
                color: 0x2b2d31,
                fields,
            };

            await interaction.channel!.send({
                embeds: [embed],
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.Button,
                                style: ButtonStyle.Secondary,
                                customId: "switch-leave-status",
                                emoji: "🔄",
                                label: interaction.options.getString("button-label") ?? "Press this pretty button to switch your on-leave status",
                            },
                        ],
                    },
                ],
            });

            await interaction.editReply("On-leave switcher has been posted!");
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === "switch-leave-status") {
            await interaction.showModal({
                title: "Switch On-Leave Status",
                customId: "confirm-switch",
                components: [
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.TextInput,
                                style: TextInputStyle.Paragraph,
                                customId: "reason",
                                label: "Reason for going on-leave",
                                placeholder: "This is optional.",
                                maxLength: 1024,
                                required: false,
                            },
                        ],
                    },
                    {
                        type: ComponentType.ActionRow,
                        components: [
                            {
                                type: ComponentType.TextInput,
                                style: TextInputStyle.Short,
                                customId: "duration",
                                label: "Duration of leave (if known)",
                                placeholder: "This is optional.",
                                maxLength: 1024,
                                required: false,
                            },
                        ],
                    },
                ],
            });
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === "confirm-switch") {
            if (interaction.guild === null) return;

            const org = GUILD_TO_ORG[interaction.guild.id];
            if (org === undefined) return;

            await interaction.deferReply({ ephemeral: true });

            const reason = interaction.fields.getTextInputValue("reason");
            const duration = interaction.fields.getTextInputValue("duration");

            let isOnLeave = false;
            let isOffLeave = false;

            for (const id of ORG_TO_GUILDS[org]) {
                const guild = interaction.client.guilds.cache.get(id);
                if (guild === undefined) continue;

                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (member === null) continue;

                for (const [offLeaveRole, onLeaveRole] of GUILD_ROLES[id]) {
                    if (member.roles.cache.has(offLeaveRole)) {
                        isOffLeave = true;
                    } else if (member.roles.cache.has(onLeaveRole)) {
                        isOnLeave = true;
                    }
                }
            }

            if (!(isOnLeave || isOffLeave)) {
                await interaction.editReply(
                    "You do not have any roles that indicate that you are either on-leave or off-leave, so the bot cannot determine what to do and there are no roles to switch.",
                );

                return;
            }

            const conflicting = isOnLeave && isOffLeave;
            const isGoingOnLeave = isOffLeave && !conflicting;

            const logChannel = interaction.client.channels.cache.get(LOG_CHANNELS[org]);
            const logGuild = logChannel ? (logChannel.isDMBased() ? null : logChannel.guild.id) : null;

            async function writeLog(message: MessageCreateOptions | string) {
                if (logChannel?.isTextBased()) await logChannel.send(message).catch(() => null);
            }

            const logs: { action: "keep" | "switch" | "merge"; roles: Role[]; name: string }[] = [];

            for (const id of ORG_TO_GUILDS[org]) {
                const guild = interaction.client.guilds.cache.get(id);
                if (guild === undefined) continue;

                const member = await guild.members.fetch(interaction.user.id).catch(() => null);
                if (member === null) continue;

                const roles = new Set(member.roles.cache.keys());

                for (const [offLeaveRole, onLeaveRole] of GUILD_ROLES[id]) {
                    const wantedRole = isGoingOnLeave ? onLeaveRole : offLeaveRole;
                    const unwantedRole = isGoingOnLeave ? offLeaveRole : onLeaveRole;

                    if (roles.has(wantedRole)) {
                        if (roles.has(unwantedRole)) {
                            roles.delete(unwantedRole);
                            logs.push({ name: guild.name, action: "merge", roles: [guild.roles.cache.get(unwantedRole)!, guild.roles.cache.get(wantedRole)!] });
                        } else {
                            logs.push({ name: guild.name, action: "keep", roles: [guild.roles.cache.get(wantedRole)!] });
                        }
                    } else if (roles.has(unwantedRole)) {
                        roles.delete(unwantedRole);
                        roles.add(wantedRole);
                        logs.push({ name: guild.name, action: "switch", roles: [guild.roles.cache.get(unwantedRole)!, guild.roles.cache.get(wantedRole)!] });
                    }
                }

                await member.roles.set([...roles]).catch(() => {
                    interaction.followUp({ content: `Failed to adjust your roles in ${guild.name}!`, ephemeral: true });
                    writeLog(`Failed to adjust roles for ${interaction.user} in ${guild.name}!`);
                });
            }

            writeLog({
                embeds: [
                    {
                        title: "On-Leave Status Switched",
                        description: `${interaction.user} has switched their on-leave status to ${isGoingOnLeave ? "on-leave" : "off-leave"}.`,
                        color: isGoingOnLeave ? Colors.Red : Colors.Green,
                        fields: [
                            reason ? { name: "Reason", value: reason } : { name: "(No Reason Provided)", value: "_ _" },
                            duration ? { name: "Duration", value: duration } : { name: "(No Duration Provided)", value: "_ _" },
                            {
                                name: "Actions",
                                value: logs
                                    .map((entry) => {
                                        const roles = entry.roles.map((role) => (role.guild.id === logGuild ? role : `@${role.name}`));

                                        return entry.action === "keep"
                                            ? `Kept ${roles[0]} in ${entry.name}`
                                            : entry.action === "switch"
                                            ? `Switched ${roles[0]} \`->\` ${roles[1]} in ${entry.name}`
                                            : entry.action === "merge"
                                            ? `User had both ${roles[0]} and ${roles[1]}, merged so they only have ${roles[1]} in ${entry.name}`
                                            : "(action unknown)";
                                    })
                                    .join("\n"),
                            },
                        ],
                    },
                ],
            });

            await interaction.editReply(
                `You are now ${isGoingOnLeave ? "on-leave" : "off-leave"}. ${
                    conflicting ? "You had conflicting roles, so I set you to off-leave by default. If you want to go on-leave, press the button again." : ""
                }`,
            );
        }
    }
});

await bot.login(process.env.TOKEN);
