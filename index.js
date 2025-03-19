import {
    Client,
    GatewayIntentBits,
    Partials,
    SlashCommandBuilder,
    Events,
    Collection,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
} from "discord.js";
import { Octokit } from "@octokit/rest";
import outofcharacter from 'out-of-character'
import { promisify } from "node:util";
import { readFileSync } from "node:fs";
import { exec as skibidi } from "node:child_process";
import dotenv from 'dotenv';

const exec = promisify(skibidi);
dotenv.config();

const bot = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});
bot.cooldowns = new Collection();

const runnedCommands = [];
const adminUserIds = ["1177722124035706931", "1098248637789786165", "389792019360514048"];
const storedStars = [];

const octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
});

const DEFAULT_SETTINGS = {
    silent: true,
    ffa: false,
    lightning: false,
    heartbeat: true
}

// SETTINGS
const subscriptData = {
    production: {
        loader: {
            id: process.env["LRM_LOADER_PROD"],
            file_name: "Loader.luau",
            settings: {
                silent: false,
                ffa: true,
                lightning: true,
                heartbeat: false
            }
        },
        split_one: {
            id: process.env["LRM_SPLIT_ONE"],
            file_name: "Split_One.luau",
            settings: DEFAULT_SETTINGS
        },
        split_two: {
            id: process.env["LRM_SPLIT_TWO"],
            file_name: "Split_Two.luau",
            settings: DEFAULT_SETTINGS
        },
    },
}

const SETTINGS = {
    GUILD_ID: "1282361102935658777",

    ROLES: {
        REQUIRED_FOR_POSTS: "1298778295982227466",
        REQUIRED_FOR_POSTS_INFO: "You can get this role from the bot panel in <#1282373591652110417>",
        BLACKLIST: "1290729273556074496",
        REVIEW_BLACKLIST: "1320839505485369456"
    },

    REQUIRED_REACTIONS: {
        BUGREPORT: [
            // { CHANNEL_ID: "1285264560298790923", ID: "1327608638294200390", EMOJI: "✅" }, // known-bugs
            { CHANNEL_ID: "1292136911858565140", ID: "1305155370364178452", EMOJI: "✅" }  // faq
        ],

        SUGGESTION: [
            // { CHANNEL_ID: "1284272976795144234", ID: "1327638810481131663", EMOJI: "✅" }, // patched-features
            { CHANNEL_ID: "1292136911858565140", ID: "1305155370364178452", EMOJI: "✅" }  // faq
        ]
    },

    CHANNELS: {
        BUGREPORT: "1282362164623052922",
        SUGGESTION: "1290728237508460594",
        REVIEW: "1320811600332062741"
    }
}
let GUILD, BUGREPORT_CHANNEL, SUGGESTION_CHANNEL, REVIEW_CHANNEL;
const CHANNEL_CACHE = [];
// SETTINGS END

// Review functions
async function getReviewData(userid) {
    let messageIdEncoded = "eyJtZXNzYWdlaWQiOi05MDAwMDAwMDAwLCJjb250ZW50IjoiTm90IEZvdW5kIiwibmFtZSI6Ik5vdCBGb3VuZCJ9";
    let messageIdSha = "";
    try {
        const existingMessageid = await octokit.rest.repos.getContent({
            owner: 'mspaint-cc',
            repo: 'assets',
            path: `reviews/${userid}/data.json`,
            ref: 'main'
        });
        messageIdEncoded = existingMessageid.data.content;
        messageIdSha = existingMessageid.data.sha;
    } catch (error) { }

    const data = JSON.parse(Buffer.from(messageIdEncoded, 'base64').toString('utf-8'));

    return {
        data: data,
        sha: messageIdSha,
        exists: data.content !== "Not Found" && data.messageid !== -9000000000
    };
}

async function updateReview(userid, data, imageContent) {
    const textContentEncoded = Buffer.from(data).toString('base64');

    let textFileSha;
    try {
        const existingFile = await octokit.rest.repos.getContent({
            owner: 'mspaint-cc',
            repo: 'assets',
            path: `reviews/${userid}/data.json`,
            ref: 'main'
        });
        textFileSha = existingFile.data.sha;
    } catch (error) {
    }

    await octokit.rest.repos.createOrUpdateFileContents({
        owner: 'mspaint-cc',
        repo: 'assets',
        path: `reviews/${userid}/data.json`,
        message: 'Update data.json',
        content: textContentEncoded,
        sha: textFileSha,
        branch: 'main'
    });

    const imageContentEncoded = Buffer.from(imageContent).toString('base64');

    let imageSha;
    try {
        const existingImage = await octokit.rest.repos.getContent({
            owner: 'mspaint-cc',
            repo: 'assets',
            path: `reviews/${userid}/pfp.png`,
            ref: 'main'
        });
        imageSha = existingImage.data.sha;
    } catch (error) { }

    await octokit.rest.repos.createOrUpdateFileContents({
        owner: 'mspaint-cc',
        repo: 'assets',
        path: `reviews/${userid}/pfp.png`,
        message: 'Add review image',
        content: imageContentEncoded,
        sha: imageSha,
        branch: 'main'
    });
}

bot.on("warn", console.warn);
bot.on("error", console.error);
bot.on("ready", async () => {
    console.log(`[READY] ${bot.user.tag} has been successfully booted up!`)

    GUILD = await bot.guilds.fetch(SETTINGS.GUILD_ID);
    if (SETTINGS.CHANNELS.BUGREPORT != "")
        BUGREPORT_CHANNEL = await GUILD.channels.fetch(SETTINGS.CHANNELS.BUGREPORT);

    if (SETTINGS.CHANNELS.SUGGESTION != "")
        SUGGESTION_CHANNEL = await GUILD.channels.fetch(SETTINGS.CHANNELS.SUGGESTION);

    if (SETTINGS.CHANNELS.REVIEW != "")
        REVIEW_CHANNEL = await GUILD.channels.fetch(SETTINGS.CHANNELS.REVIEW);

    // developer commands //
    const updateCommand = new SlashCommandBuilder()
        .setName('update')
        .setDescription('[DEVELOPER ONLY] update mspaint to luarmor')
        .addStringOption(option => option.setName('subscript')
            .setDescription('the sub-script to update')
            .setRequired(true)
            .addChoices(
                { name: 'production', value: 'production' },
            )
        );

    // user commands //
    const bugReportCommand = new SlashCommandBuilder()
        .setName('bugreport')
        .setDescription('Submit a bug report')
        .addAttachmentOption((option) => option
            .setName("console")
            .setDescription("The Developer Console (/console).")
        )
        .addAttachmentOption((option) => option
            .setName("video")
            .setDescription("Any video of what the bug does or how to reproduce it.")
        );

    const suggestionCommand = new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Submit a suggestion');

    const reviewCommand = new SlashCommandBuilder()
        .setName('review')
        .setDescription('Review the mspaint script')
        .addStringOption(option => option.setName('stars')
            .setDescription('amount of stars you want to give')
            .setRequired(true)
            .addChoices(
                { name: '⭐⭐⭐⭐⭐', value: '⭐⭐⭐⭐⭐' },
                { name: '⭐⭐⭐⭐', value: '⭐⭐⭐⭐' },
                { name: '⭐⭐⭐', value: '⭐⭐⭐' },
                { name: '⭐⭐', value: '⭐⭐' },
                { name: '⭐', value: '⭐' },
            )
        );

    // create commands
    bot.application.commands.create(updateCommand);

    bot.application.commands.create(bugReportCommand);
    bot.application.commands.create(suggestionCommand);
    bot.application.commands.create(reviewCommand);
});
process.stdin.resume()

function exitHandler(options, exitCode) {
    if (options.cleanup || options.exit) bot.destroy();
    process.exit()
}

process.on('exit', exitHandler.bind(null, { cleanup: true }));
process.on('SIGINT', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));
process.on('uncaughtException', exitHandler.bind(null, { exit: true }));

async function moderateReview(review) {
    if (/^\s*$/.test(review)) {
        return { filtered: "", didChange: true }
    }

    review = review.replace("\n", "");
    review = review.replace("\r", "");
    review = review.replace("\t", "");
    review = review.replace("\v", "");
    review = review.replace("\f", "");

    // Fetch the profanity list JSON
    const unfiltered = review;

    const response = await fetch('https://raw.githubusercontent.com/dsojevic/profanity-list/main/en.json', {
        cache: "force-cache",
        next: { revalidate: 3600 } // one hour
    });
    const profanityData = await response.json();
    const profanityList = profanityData.map(entry => entry.match);

    // Regular expression to match URLs + Discord Invites, excluding discord.gg/mspaint
    // will filter: (discord.com as example)
    //      https://discord.gg/[any_invite]
    //      https://discord.com/invite/[any_invite]
    //      discord.com
    //      www.discord.com
    //      http://discord.com
    //      https://discord.com
    //      https://discord.com/path
    //      https://discord.com/really/long/path

    review = review.replace(/(?:https?:\/\/)?(?:www\.)?[\w-]+\.\w+(?:[\/\w.-]*)*/gi, (match) => {
        return (
            match.toLowerCase() === "https://discord.gg/mspaint" ||
            match.toLowerCase() === "discord.gg/mspaint" ||
            match.toLowerCase() === "https://mspaint.cc/" ||
            match.toLowerCase() === "https://mspaint.cc"
        ) ? match : "[REDACTED]";
    });
    review = review.replace(/(?:https?:\/\/)?(?:discord[\W_]*gg\/[\w-]*|discord[\W_]*com(?:\/invite\/[\w-]*|\/[\w-]*))/gi, (match) => {
        return (
            match.toLowerCase() === "https://discord.gg/mspaint" ||
            match.toLowerCase() === "discord.gg/mspaint" ||
            match.toLowerCase() === "https://mspaint.cc/" ||
            match.toLowerCase() === "https://mspaint.cc"
        ) ? match : "[REDACTED]";
    });
    review = review.replace(/(?:https?:\/\/)?gg\/[\w-]+/gi, (match) => {
        return (
            match.toLowerCase() === ".gg/mspaint"
        ) ? match : "[REDACTED]";
    });
    review = review.replace(/(?:https?:\/\/)?gg\\[\w-]+/gi, "[REDACTED]");
    review = review.replace(/discord[\s\S]*?gg/gu, "[REDACTED]");

    review = review.replace(/%[0-9A-Fa-f]{2}/g, "*"); // Replace URL encoded characters with asterisks

    // Replace profane words with asterisks
    profanityList.forEach((word) => {
        const profanityRegex = new RegExp(`\\b${word}\\b`, 'gi');
        review = review.replace(profanityRegex, (match) => "*".repeat(match.length));
    });

    /* there is an unicode here but its stupid af (who cooked this) */                                                review = review.replace(" ̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺ͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩ", "*")
    review = review.replace("•", "*")
    review = review.replace("﷽", "*")
    review = review.replace("𒈙", "*")
    review = review.replace("⸻", "*")
    review = review.replace("꧅", "*")
    review = review.replace("𒐪", "*")
    review = review.replace("𒐩", "*")
    review = review.replace("𒐫", "*")
    review = review.replace("ဪ", "*")
    review = review.replace("", "*")
    review = review.replace("𒐬", "*")

    return { filtered: review, didChange: review !== unfiltered };
}

// Handler
function checkCooldown(cooldownAmount, interaction, cooldownId, skip) {
    cooldownAmount = cooldownAmount * 1_000;
    const { cooldowns } = interaction.client;
    if (!cooldowns.has(interaction.commandName)) cooldowns.set(interaction.commandName, new Collection());

    const now = Date.now();
    const timestamps = cooldowns.get(interaction.commandName);
    if (timestamps.has(cooldownId)) {
        const expirationTime = timestamps.get(cooldownId) + cooldownAmount;

        if (now < expirationTime) {
            const expiredTimestamp = Math.round(expirationTime / 1_000);
            interaction.reply({ content: `Please wait, this command is on a cooldown! You can use this command again <t:${expiredTimestamp}:R>.`, ephemeral: true });
            return true;
        }
    };

    if (skip !== true) {
        timestamps.set(cooldownId, now);
        setTimeout(() => timestamps.delete(cooldownId), cooldownAmount);
    }

    return false;
}

// data
/*

{
    "updating": false,
    "building": false,
    "publishing": false,

    "errored": false,
    "whereError": "updating",
    "error": "error message",
    "info": "Updating Loader.luau (example)"
}
*/
function generateUpdateText(data) {
    let text = "```ini\n[Updating] ❌\n[Building] ❌\n[Publishing] ❌\n```"

    if (data.updating) {
        const emoji_to_add = data.errored && data.whereError == "updating" ? "⚠️" : "✅";
        const suffix = data.errored && data.whereError == "updating" ? "\n\n```diff\n- " + data.error + "\n```" : "";

        text = "```ini\n[Updating] " + emoji_to_add + "\n[Building] 🔄\n[Publishing] ❌\n" + (data.info ? "\n[Info] " + data.info + "\n" : "") + "```" + suffix
    }

    if (data.building) {
        const emoji_to_add = data.errored && data.whereError == "building" ? "⚠️" : "✅";
        const suffix = data.errored && data.whereError == "building" ? "\n\n```diff\n- " + data.error + "\n```" : "";

        text = "```ini\n[Updating] ✅\n[Building] " + emoji_to_add + "\n[Publishing] 🔄\n" + (data.info ? "\n[Info] " + data.info + "\n" : "") + "```" + suffix
    }

    if (data.publishing) {
        const emoji_to_add = data.errored && data.whereError == "publishing" ? "⚠️" : "✅";
        const suffix = data.errored && data.whereError == "publishing" ? "\n\n```diff\n- " + data.error + "\n```" : "";

        text = "```ini\n[Updating] ✅\n[Building] ✅\n[Publishing] " + emoji_to_add + "\n" + (data.info ? "\n[Info] " + data.info + "\n" : "") + "```" + suffix
    }

    return text;
}

// events
bot.on(Events.MessageReactionAdd, async (reaction, user) => { // for cache updates, i love discord
    try {
        let found = false;
        for (const idx in SETTINGS.REQUIRED_REACTIONS) {
            const arr = SETTINGS.REQUIRED_REACTIONS[idx];

            for (const val_idx in arr) {
                if (reaction.message.id === arr[val_idx].ID) {
                    found = true;
                    break;
                }
            }
        }
        if (!found) return;

        if (reaction.partial) await reaction.fetch();
        if (reaction.users.cache.size === 0) await reaction.users.fetch();
    } catch (error) {
        return
    }
});

bot.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
        // DEVELOPER COMMANDS //
        if (interaction.commandName == 'update') {
            if (!adminUserIds.includes(interaction.user.id))
                await interaction.reply({ content: "You are not allowed to use this command.", ephemeral: true });

            const start_time = performance.now()
            const reply = await interaction.reply({
                content: null,
                embeds: [
                    {
                        "title": "Updating mspaint from latest github commit....",
                        "description": generateUpdateText({
                            updating: false,
                            building: false,
                            publishing: false,

                            errored: false,
                            whereError: "",
                            error: ""
                        }),
                        "color": 16734296
                    }
                ]
            });

            const { error, stdout, stderr } = await exec("bash update.sh");

            const subscript = interaction.options.getString('subscript');
            const script_ids = subscriptData[subscript];

            if (error)
                return await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "ERROR: Couldn't update mspaint",
                            "description": generateUpdateText({
                                updating: true,
                                building: false,
                                publishing: false,

                                errored: true,
                                whereError: "updating",
                                error: toString(error)
                            }),
                            "color": 16734296
                        }
                    ]
                });

            if (!script_ids)
                return await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "ERROR: Invalid subscript",
                            "description": generateUpdateText({
                                updating: true,
                                building: false,
                                publishing: false,

                                errored: true,
                                whereError: "updating",
                                error: "Error: Invalid subscript"
                            }),
                            "color": 16734296
                        }
                    ]
                });

            await reply.edit({
                content: null,
                embeds: [
                    {
                        "title": "Publishing built script to luarmor....",
                        "description": generateUpdateText({
                            updating: false,
                            building: true,
                            publishing: false,

                            errored: false,
                            whereError: "",
                            error: ""
                        }),
                        "color": 16734296
                    }
                ]
            });

            const { build_error, build_stdout, build_stderr } = await exec("bash build.sh");

            if (build_error) {
                return await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "ERROR: Coudn't update mspaint",
                            "description": generateUpdateText({
                                updating: true,
                                building: true,
                                publishing: false,

                                errored: true,
                                whereError: "building",
                                error: toString(build_error)
                            }),
                            "color": 16734296
                        }
                    ]
                });
            }

            for (const subscriptKey in script_ids) {
                const subscriptData = script_ids[subscriptKey];
                const settings = subscriptData.settings;
                let script_src = "warn('Something went wrong.')";

                try {
                    script_src = readFileSync(`mspaint-src/Distribution/${subscriptData.file_name}`, "utf-8");
                } catch (error) {
                    return await reply.edit({
                        content: null,
                        embeds: [
                            {
                                "title": "ERROR: Couldn't update mspaint",
                                "description": generateUpdateText({
                                    updating: true,
                                    building: true,
                                    publishing: false,

                                    errored: true,
                                    whereError: "building",
                                    error: toString(error)
                                }),
                                "color": 16734296
                            }
                        ]
                    });
                }

                if (script_src === "warn('Something went wrong.')")
                    return await reply.edit({
                        content: null,
                        embeds: [
                            {
                                "title": "ERROR: Couldn't update mspaint",
                                "description": generateUpdateText({
                                    updating: true,
                                    building: true,
                                    publishing: false,

                                    errored: true,
                                    whereError: "building",
                                    error: "Error: Couldn't read file (mspaint-src/Distribution/" + subscriptData.file_name + ")"
                                }),
                                "color": 16734296
                            }
                        ]
                    });

                await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "Publishing built script to luarmor...",
                            "description": generateUpdateText({
                                updating: true,
                                building: true,
                                publishing: false,

                                errored: false,
                                whereError: "",
                                error: "",
                                info: `Updating ${subscriptKey}`
                            }),
                            "color": 16734296
                        }
                    ]
                });


                const response = await fetch(`https://api.luarmor.net/v3/projects/${process.env.LRM_SCRIPT_ID}/scripts/${subscriptData.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": process.env["LRM_API_KEY"]
                    },
                    body: JSON.stringify({
                        script: script_src,
                        ...settings
                    })
                })

                try {
                    const data = await response.json();
                    if (!response.ok || !data.success) {
                        return await reply.edit({
                            content: null,
                            embeds: [
                                {
                                    "title": "ERROR: Couldn't publish to luarmor",
                                    "description": generateUpdateText({
                                        updating: true,
                                        building: true,
                                        publishing: false,

                                        errored: true,
                                        whereError: "publishing",
                                        error: JSON.parse(data.message).error
                                    }),
                                    "color": 16734296
                                }
                            ]
                        });
                    }
                } catch (error) {
                    return await reply.edit({
                        content: null,
                        embeds: [
                            {
                                "title": "ERROR: Couldn't publish to luarmor",
                                "description": generateUpdateText({
                                    updating: true,
                                    building: true,
                                    publishing: false,

                                    errored: true,
                                    whereError: "publishing",
                                    error: "HTTP Error: " + response.status + " (" + response.statusText + ")\n" + toString(error)
                                }),
                                "color": 16734296
                            }
                        ]
                    });
                }
            }

            await reply.edit({
                content: null,
                embeds: [
                    {
                        "title": `Successfully updated mspaint (${interaction.options.getString('subscript')}) to luarmor`,
                        "description": generateUpdateText({
                            updating: true,
                            building: true,
                            publishing: true,

                            errored: false,
                            whereError: "",
                            error: "",
                            info: `Updated in ${((performance.now() - start_time) / 1000).toFixed(2)}s`
                        }),
                        "color": 6094592
                    }
                ],
            });

            return;
        }

        // USER COMMANDS //
        let cooldownAmount = 10;

        if (interaction.commandName == 'bugreport')
            cooldownAmount = 300;
        else if (interaction.commandName == 'suggestion')
            cooldownAmount = 120;
        else if (interaction.commandName == 'review')
            cooldownAmount = 120;

        if (checkCooldown(cooldownAmount, interaction, interaction.user.id, false)) return; // USER

        // GLOBAL //
        const now = Date.now();
        runnedCommands.push(now)
        const runnedFilter = runnedCommands.filter(timestamp => now - timestamp <= 10_000);
        if (runnedFilter.length >= 5) { // 5 commands in 10 seconds then cooldown for 15 seconds
            checkCooldown(15, interaction, "global", false)
            runnedCommands = [];
        }
        if (checkCooldown(15, interaction, "global", true)) return;
        // GLOBAL END //

        if (interaction.commandName == 'bugreport') {
            if (SETTINGS.ROLES.BLACKLIST != "" && interaction.member.roles.cache.has(SETTINGS.ROLES.BLACKLIST))
                return await interaction.reply({ content: "You are blacklisted.", ephemeral: true });

            if (SETTINGS.ROLES.REQUIRED_FOR_POSTS != "" && !interaction.member.roles.cache.has(SETTINGS.ROLES.REQUIRED_FOR_POSTS))
                return await interaction.reply({ content: "You are missing the <@&" + SETTINGS.ROLES.REQUIRED_FOR_POSTS + "> role. " + SETTINGS.ROLES.REQUIRED_FOR_POSTS_INFO, ephemeral: true });

            // REACTIONS
            try {
                for (const reaction_idx in SETTINGS.REQUIRED_REACTIONS.BUGREPORT) {
                    const reaction_data = SETTINGS.REQUIRED_REACTIONS.BUGREPORT[reaction_idx];

                    const reaction_channel = CHANNEL_CACHE.includes(reaction_data.CHANNEL_ID) ? CHANNEL_CACHE[reaction_data.CHANNEL_ID] : await GUILD.channels.fetch(reaction_data.CHANNEL_ID);
                    if (!reaction_channel) return await interaction.reply({ content: "Failed to verify required reaction(s).\n-# Couldn't fetch channel.", ephemeral: true });
                    CHANNEL_CACHE[reaction_data.CHANNEL_ID] = reaction_channel;

                    const reaction_message = await reaction_channel.messages.fetch(reaction_data.ID);
                    if (!reaction_message) return await interaction.reply({ content: "Failed to verify required reaction(s).\n-# Couldn't get message from cache.", ephemeral: true });

                    const emoji_reaction = reaction_message.reactions.cache.get(reaction_data.EMOJI);
                    if (!emoji_reaction)
                        return await interaction.reply({ content: "Please read and react with " + reaction_data.EMOJI + " to this message: https://discord.com/channels/" + SETTINGS.GUILD_ID + "/" + reaction_data.CHANNEL_ID + "/" + reaction_data.ID, ephemeral: true });

                    if (emoji_reaction.users.cache.size === 0) await emoji_reaction.users.fetch();
                    if (!emoji_reaction.users.cache.get(interaction.user.id))
                        return await interaction.reply({ content: "Please read and react with " + reaction_data.EMOJI + " to this message: https://discord.com/channels/" + SETTINGS.GUILD_ID + "/" + reaction_data.CHANNEL_ID + "/" + reaction_data.ID, ephemeral: true });
                }
            } catch (error) {
                console.warn(error);
                return await interaction.reply({ content: "Failed to verify required reaction(s).", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('bugReportModal')
                .setTitle('Submit a Bug Report');

            const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title/Name of the bug.')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(20)
                .setRequired(true);

            const executorInput = new TextInputBuilder()
                .setCustomId('executor')
                .setLabel('What is your executor?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Describe the bug you have encountered.')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(25)
                .setMaxLength(1000)
                .setRequired(true);

            const titleRow = new ActionRowBuilder().addComponents(titleInput);
            const executorRow = new ActionRowBuilder().addComponents(executorInput);
            const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);

            modal.addComponents(titleRow, executorRow, descriptionRow);

            const consoleAttachment = interaction.options.getAttachment('console');
            const videoAttachment = interaction.options.getAttachment('video');
            interaction.client.bugReportAttachments = interaction.client.bugReportAttachments || {};
            interaction.client.bugReportAttachments[interaction.user.id] = { consoleAttachment, videoAttachment };

            await interaction.showModal(modal);
        } else if (interaction.commandName == 'suggestion') {
            if (SETTINGS.ROLES.BLACKLIST != "" && interaction.member.roles.cache.has(SETTINGS.ROLES.BLACKLIST))
                return await interaction.reply({ content: "You are blacklisted.", ephemeral: true });

            if (SETTINGS.ROLES.REQUIRED_FOR_POSTS != "" && !interaction.member.roles.cache.has(SETTINGS.ROLES.REQUIRED_FOR_POSTS))
                return await interaction.reply({ content: "You are missing the <@&" + SETTINGS.ROLES.REQUIRED_FOR_POSTS + "> role. " + SETTINGS.ROLES.REQUIRED_FOR_POSTS_INFO, ephemeral: true });

            // REACTIONS
            try {
                for (const reaction_idx in SETTINGS.REQUIRED_REACTIONS.SUGGESTION) {
                    const reaction_data = SETTINGS.REQUIRED_REACTIONS.SUGGESTION[reaction_idx];

                    const reaction_channel = CHANNEL_CACHE.includes(reaction_data.CHANNEL_ID) ? CHANNEL_CACHE[reaction_data.CHANNEL_ID] : await GUILD.channels.fetch(reaction_data.CHANNEL_ID);
                    if (!reaction_channel) return await interaction.reply({ content: "Failed to verify required reaction(s).\n-# Couldn't fetch channel.", ephemeral: true });
                    CHANNEL_CACHE[reaction_data.CHANNEL_ID] = reaction_channel;

                    const reaction_message = await reaction_channel.messages.fetch(reaction_data.ID);
                    if (!reaction_message) return await interaction.reply({ content: "Failed to verify required reaction(s).\n-# Couldn't get message from cache.", ephemeral: true });

                    const emoji_reaction = reaction_message.reactions.cache.get(reaction_data.EMOJI);
                    if (!emoji_reaction)
                        return await interaction.reply({ content: "Please read and react with " + reaction_data.EMOJI + " to this message: https://discord.com/channels/" + SETTINGS.GUILD_ID + "/" + reaction_data.CHANNEL_ID + "/" + reaction_data.ID, ephemeral: true });

                    if (emoji_reaction.users.cache.size === 0) await emoji_reaction.users.fetch();
                    if (!emoji_reaction.users.cache.get(interaction.user.id))
                        return await interaction.reply({ content: "Please read and react with " + reaction_data.EMOJI + " to this message: https://discord.com/channels/" + SETTINGS.GUILD_ID + "/" + reaction_data.CHANNEL_ID + "/" + reaction_data.ID, ephemeral: true });
                }
            } catch (error) {
                console.warn(error);
                return await interaction.reply({ content: "Failed to verify required reaction(s).", ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId('suggestionModal')
                .setTitle('Submit a Suggestion');

            const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title/Name of the suggestion.')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(20)
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Describe the suggestion.')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(25)
                .setMaxLength(1000)
                .setRequired(true);

            const titleRow = new ActionRowBuilder().addComponents(titleInput);
            const descriptionRow = new ActionRowBuilder().addComponents(descriptionInput);
            modal.addComponents(titleRow, descriptionRow);

            await interaction.showModal(modal);
        } else if (interaction.commandName == 'review') {
            if (SETTINGS.ROLES.REVIEW_BLACKLIST != "" && interaction.member.roles.cache.has(SETTINGS.ROLES.REVIEW_BLACKLIST))
                return await interaction.reply({ content: "You are blacklisted.", ephemeral: true });

            if (SETTINGS.ROLES.REQUIRED_FOR_POSTS != "" && !interaction.member.roles.cache.has(SETTINGS.ROLES.REQUIRED_FOR_POSTS))
                return await interaction.reply({ content: "You are missing the <@&" + SETTINGS.ROLES.REQUIRED_FOR_POSTS + "> role. " + SETTINGS.ROLES.REQUIRED_FOR_POSTS_INFO, ephemeral: true });

            const review = await getReviewData(interaction.user.id);
            let reviewText = review.exists ? "Edit your review for mspaint." : "Submit a review for mspaint.";

            const stars = interaction.options.getString('stars');
            storedStars[interaction.user.id.toString()] = stars;

            const modal = new ModalBuilder()
                .setCustomId('reviewModal')
                .setTitle(reviewText);

            const reviewInput = new TextInputBuilder()
                .setCustomId('Review')
                .setLabel('Your review of mspaint.')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(115)
                .setRequired(true);

            const reviewRow = new ActionRowBuilder().addComponents(reviewInput);
            modal.addComponents(reviewRow);

            await interaction.showModal(modal);
        }

        return;
    };

    if (interaction.isModalSubmit()) {
        if (interaction.customId === "bugReportModal") {
            await interaction.deferReply({ ephemeral: true });
            if (!BUGREPORT_CHANNEL) {
                await interaction.editReply({ content: 'Error: Forum channel not found, report this to upio or mstudio45.', ephemeral: true });
                return;
            }

            const title = interaction.fields.getTextInputValue('title');
            const executor = interaction.fields.getTextInputValue('executor');
            const description = interaction.fields.getTextInputValue('description');

            const attachments = interaction.client.bugReportAttachments ? (interaction.client.bugReportAttachments[interaction.user.id] || {}) : {};
            const files = [];

            if (attachments.consoleAttachment) files.push(attachments.consoleAttachment);
            if (attachments.videoAttachment) files.push(attachments.videoAttachment);

            try {
                const thread = await BUGREPORT_CHANNEL.threads.create({
                    name: title,
                    message: {
                        content: `**User**: ${interaction.user.username} <@${interaction.user.id}> (${interaction.user.id})
**Executor**: \`${executor}\`
**Description**: \`\`\`
${description}
\`\`\``,
                        files: files
                    },
                    reason: `Bug Report | ${interaction.user.username} (${interaction.user.id})`
                });

                await interaction.editReply({
                    content: `Bug report created successfully! You can view it here: ${thread.url}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error in bug report command:', error);
                await interaction.editReply({
                    content: 'An error occurred while processing your bug report. Please try again later.',
                    ephemeral: true
                });
            }
        } else if (interaction.customId === "suggestionModal") {
            await interaction.deferReply({ ephemeral: true });
            if (!SUGGESTION_CHANNEL) {
                await interaction.editReply({ content: 'Error: Suggestion channel not found, report this to upio or mstudio45.', ephemeral: true });
                return;
            }

            const title = interaction.fields.getTextInputValue('title');
            const description = interaction.fields.getTextInputValue('description');

            try {
                const thread = await SUGGESTION_CHANNEL.threads.create({
                    name: title,
                    message: {
                        content: `**User**: ${interaction.user.username} <@${interaction.user.id}> (${interaction.user.id})
**Description**: \`\`\`
${description}
\`\`\``
                    },
                    reason: `Suggestion | ${interaction.user.username} (${interaction.user.id})`
                });
                await thread.lastMessage.react("✅");
                await thread.lastMessage.react("❌");

                await interaction.editReply({
                    content: `Suggestion created successfully! You can view it here: ${thread.url}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error in suggestion command:', error);
                await interaction.editReply({
                    content: 'An error occurred while processing your suggestion. Please try again later.',
                    ephemeral: true
                });
            }
        } else if (interaction.customId === "reviewModal") {
            await interaction.deferReply({ ephemeral: true });
            if (!REVIEW_CHANNEL) {
                await interaction.editReply({ content: 'Error: Review channel not found, report this to upio or mstudio45.', ephemeral: true });
                return;
            }

            try {
                const review = outofcharacter.replace(interaction.fields.getTextInputValue('Review'));
                const stars = interaction.user.id.toString() in storedStars ? storedStars[interaction.user.id.toString()] : "⭐⭐⭐⭐⭐";

                const userImage = await fetch(interaction.user.displayAvatarURL({ format: 'png', size: 256 }), { method: 'GET' });
                const imageBuffer = Buffer.from(await userImage.arrayBuffer());

                const filter = await moderateReview(review);
                if (filter.didChange === true) {
                    await interaction.editReply({
                        content: "Your review was filtered!\n\n```\n" + filter.filtered.toString() + "\n```",
                        ephemeral: true
                    });

                    return;
                }

                const embed = new EmbedBuilder()
                    .setTitle(`mspaint review`)
                    .setColor(
                        stars.length == 1 ? 15548997 : // RED
                            (
                                (stars.length > 1 && stars.length < 4) ?
                                    15105570 : // ORANGE
                                    5763719 // GREEN
                            )
                    )
                    .addFields(
                        { name: "User", value: `${interaction.user.username} <@${interaction.user.id}>`, inline: true },
                        { name: "Stars", value: stars, inline: true },
                        { name: "Review", value: review }
                    )
                    .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL({ format: 'png', size: 256 }), url: 'https://www.mspaint.cc/' })
                    .setTimestamp();

                let newReviewData = {
                    name: interaction.user.displayName,
                    username: interaction.user.username,
                    content: review,
                    stars: stars.length,
                    messageid: ""
                }

                const existingReviewData = await getReviewData(interaction.user.id);
                if (!existingReviewData.exists) {
                    const message = await REVIEW_CHANNEL.send({
                        embeds: [embed]
                    });

                    newReviewData.messageid = message.id;
                } else {
                    newReviewData.messageid = existingReviewData.data.messageid;

                    const message = await REVIEW_CHANNEL.messages.fetch(existingReviewData.data.messageid);
                    await message.edit({
                        embeds: [embed]
                    });
                }

                await updateReview(interaction.user.id, JSON.stringify(newReviewData, null, 2), imageBuffer);

                await interaction.editReply({
                    content: existingReviewData.exists ? "Edited review successfully!" : "Review submitted successfully!",
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error in review command:', error);
                await interaction.editReply({
                    content: 'An error occurred while processing your review. Please try again later.',
                    ephemeral: true
                });
            }

            storedStars[interaction.user.id.toString()] = undefined;
        }

        return;
    };
});

bot.login(process.env["DISCORD_BOT_TOKEN"]);
