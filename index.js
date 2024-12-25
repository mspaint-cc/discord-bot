import {
    Client,
    GatewayIntentBits,
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
    ]
});
bot.cooldowns = new Collection();

const runnedCommands = [];
const adminUserIds = ["1177722124035706931", "1098248637789786165", "389792019360514048"];
const storedStars = [];

const octokit = new Octokit({
    auth: process.env["GITHUB_TOKEN"]
});

// SETTINGS
const GUILD_ID = "1282361102935658777"
const BLACKLIST_ROLE = "1290729273556074496"
const REVIEW_BLACKLIST_ROLE = "1320839505485369456"

let BUGREPORT_ID = "1282362164623052922", BUGREPORT_CHANNEL;
let SUGGESTION_ID = "1290728237508460594", SUGGESTION_CHANNEL;
let REVIEW_ID = "1320811600332062741", REVIEW_CHANNEL;
// SETTINGS END

const subscriptIds = {
    production: process.env["LRM_SUBSCRIPT_PROD"],
    test: process.env["LRM_SUBSCRIPT_TEST"]
}

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
        exists: data.content !== "Not Found" && data.messageid === -9000000000
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

    const guild = await bot.guilds.fetch(GUILD_ID);
    if (BUGREPORT_ID != "") BUGREPORT_CHANNEL = await guild.channels.fetch(BUGREPORT_ID);
    if (SUGGESTION_ID != "") SUGGESTION_CHANNEL = await guild.channels.fetch(SUGGESTION_ID);
    if (REVIEW_ID != "") REVIEW_CHANNEL = await guild.channels.fetch(REVIEW_ID);

    // bug report command
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

    bot.application.commands.create(bugReportCommand);

    // suggestion command
    const suggestionCommand = new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Submit a suggestion');

    bot.application.commands.create(suggestionCommand);

    const updateCommand = new SlashCommandBuilder()
        .setName('update')
        .setDescription('[DEVELOPER ONLY] update mspaint to luarmor')
        .addStringOption(option =>
            option.setName('subscript')
                .setDescription('the sub-script to update')
                .setRequired(true)
                .addChoices(
                    { name: 'production', value: 'production' },
                    { name: 'test', value: 'test' }
                ));

    bot.application.commands.create(updateCommand);

    // review command
    const reviewCommand = new SlashCommandBuilder()
        .setName('review')
        .setDescription('Review the mspaint script')
        .addStringOption(option =>
            option.setName('stars')
                .setDescription('amount of stars you want to give')
                .setRequired(true)
                .addChoices(
                    { name: '⭐⭐⭐⭐⭐', value: '⭐⭐⭐⭐⭐' },
                    { name: '⭐⭐⭐⭐', value: '⭐⭐⭐⭐' },
                    { name: '⭐⭐⭐', value: '⭐⭐⭐' },
                    { name: '⭐⭐', value: '⭐⭐' },
                    { name: '⭐', value: '⭐' },
                ));

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
    review = review.replace(/(?:https?:\/\/)?(?:discord\.gg\/[\w-]*|discord\.com(?:\/invite\/[\w-]*|\/[\w-]*))/g, (match) => {
        return (
            match.toLowerCase() === "https://discord.gg/mspaint" ||
            match.toLowerCase() === "discord.gg/mspaint" ||
            match.toLowerCase() === "https://mspaint.cc/" ||
            match.toLowerCase() === "https://mspaint.cc"
        ) ? match : "[REDACTED]";
    });

    // Replace profane words with asterisks
    profanityList.forEach((word) => {
        const profanityRegex = new RegExp(`\\b${word}\\b`, 'gi');
        review = review.replace(profanityRegex, (match) => "*".repeat(match.length));
    });

    /* there is an unicode here but its stupid af (who cooked this) */                                                review = review.replace(" ̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺̺ͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩͩ", "*")
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

bot.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isCommand()) {
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
            if (BLACKLIST_ROLE != "" && interaction.member.roles.cache.has(BLACKLIST_ROLE)) {
                await interaction.reply({ content: "You are blacklisted.", ephemeral: true })
                return;
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
            if (BLACKLIST_ROLE != "" && interaction.member.roles.cache.has(BLACKLIST_ROLE)) {
                await interaction.reply({ content: "You are blacklisted.", ephemeral: true })
                return;
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
        } else if (interaction.commandName == 'update') {
            if (!adminUserIds.includes(interaction.user.id)) {
                await interaction.reply({ content: "You are not allowed to use this command.", ephemeral: true });
            }

            const reply = await interaction.reply({
                content: null,
                embeds: [
                    {
                        "title": "Updating mspaint from latest github commit....",
                        "description": "```ini\n[Building] 🔄\n[Publishing] ❌\n```",
                        "color": 16734296
                    }
                ]
            });

            const { error, stdout, stderr } = await exec("bash build_mspaint.sh");

            if (error) {
                await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "ERROR: Coudn't update mspaint",
                            "description": "```ini\n[Building] ⚠\n[Publishing] ❌\n```\n\n```diff\n- " + toString(error) + "\n```",
                            "color": 16734296
                        }
                    ]
                });
                return;
            }

            await reply.edit({
                content: null,
                embeds: [
                    {
                        "title": "Publishing built script to luarmor....",
                        "description": "```ini\n[Building] ✅\n[Publishing] 🔄\n```",
                        "color": 16734296
                    }
                ]
            });

            const built_version = readFileSync("mspaint-src/Distribution/Script.luau", "utf-8");

            const script_id = subscriptIds[interaction.options.getString('subscript')];
            if (!script_id) {
                await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "ERROR: Invalid subscript",
                            "description": "```ini\n[Building] ✅\n[Publishing] ❌\n```\n\n```diff\n- Error: Invalid subscript\n```",
                            "color": 16734296
                        }
                    ]
                });
                return;
            }

            try {
                const response = await fetch(`https://api.luarmor.net/v3/projects/${process.env.LRM_SCRIPT_ID}/scripts/${script_id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": process.env["LRM_API_KEY"]
                    },
                    body: JSON.stringify({
                        script: built_version
                    })
                })

                const data = await response.json();
                if (!response.ok || !data.success) {
                    await reply.edit({
                        content: null,
                        embeds: [
                            {
                                "title": "ERROR: Couldn't publish to luarmor",
                                "description": "```ini\n[Building] ✅\n[Publishing] ⚠\n```\n\n```diff\n- " + JSON.parse(data.message).error + "\n```",
                                "color": 16734296
                            }
                        ]
                    });
                    return;
                }

                await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": `Successfully updated mspaint (${interaction.options.getString('subscript')}) to luarmor`,
                            "description": "```ini\n[Building] ✅\n[Publishing] ✅\n```",
                            "color": 6094592
                        }
                    ],
                });
            } catch (error) {
                await reply.edit({
                    content: null,
                    embeds: [
                        {
                            "title": "ERROR: Couldn't publish to luarmor",
                            "description": "```ini\n[Building] ✅\n[Publishing] ⚠\n```\n\n```diff\n- " + error.message + "\n```",
                            "color": 16734296
                        }
                    ]
                });
            }

        } else if (interaction.commandName == 'review') {
            if (REVIEW_BLACKLIST_ROLE != "" && interaction.member.roles.cache.has(REVIEW_BLACKLIST_ROLE)) {
                await interaction.reply({ content: "You are blacklisted.", ephemeral: true })
                return;
            }

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

            const attachments = interaction.client.bugReportAttachments[interaction.user.id] || {};
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
