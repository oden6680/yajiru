require("dotenv").config();

const {
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

requireEnv("DISCORD_TOKEN", DISCORD_TOKEN);
requireEnv("DISCORD_CLIENT_ID", DISCORD_CLIENT_ID);

const commands = [
  new SlashCommandBuilder()
    .setName("lt")
    .setDescription("LT comment overlay controls")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Pair this Discord channel with an overlay screen")
        .addStringOption((option) =>
          option
            .setName("code")
            .setDescription("Pairing code shown on the overlay")
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("stop")
        .setDescription("Stop the overlay for this channel")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("clear")
        .setDescription("Clear comments currently shown on the overlay")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show overlay pairing status for this channel")
    )
    .toJSON()
];

async function main() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  const route = DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID)
    : Routes.applicationCommands(DISCORD_CLIENT_ID);

  await rest.put(route, { body: commands });

  if (DISCORD_GUILD_ID) {
    console.log(`Registered /lt commands for guild ${DISCORD_GUILD_ID}.`);
  } else {
    console.log("Registered global /lt commands.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
