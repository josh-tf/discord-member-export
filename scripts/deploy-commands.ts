import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { pathToFileURL } from 'url';

/**
 * Standalone command deployment script
 *
 * Usage:
 *   npm run deploy-commands        # Deploy to guild (instant)
 *   npm run deploy-commands global # Deploy globally (1 hour)
 */

// Load environment variables
config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

async function deployCommands() {
  try {
    console.log('📦 Loading commands...');

    // Load all commands
    const commands = [];
    const commandsPath = join(process.cwd(), 'dist', 'commands');
    const commandFiles = readdirSync(commandsPath).filter(
      (file) => file.endsWith('.js') && !file.includes('Command'),
    );

    for (const file of commandFiles) {
      const filePath = join(commandsPath, file);
      const fileURL = pathToFileURL(filePath).href;
      const commandModule = await import(fileURL);

      if ('default' in commandModule) {
        const command = commandModule.default;
        if (command.data && command.execute) {
          commands.push(command.data.toJSON());
          console.log(`  ✅ Loaded: ${command.data.name}`);
        }
      }
    }

    console.log(`\n📋 Found ${commands.length} commands\n`);

    // Initialize REST client
    const rest = new REST({ version: '10' }).setToken(token);

    // Determine deployment type
    const isGlobal = process.argv.includes('global');

    if (isGlobal) {
      // Deploy globally
      console.log('🌍 Deploying commands globally...');
      console.log('⏳ This will take ~1 hour to propagate to all servers');

      await rest.put(Routes.applicationCommands(clientId), {
        body: commands,
      });

      console.log('✅ Commands deployed globally!');
      console.log('⏰ Wait ~1 hour for commands to appear in all servers');
    } else if (guildId) {
      // Deploy to specific guild
      console.log(`🏠 Deploying commands to guild ${guildId}...`);

      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });

      console.log('✅ Commands deployed to guild instantly!');
      console.log('🎉 Commands should appear immediately in your server');
    } else {
      console.error('❌ No DISCORD_GUILD_ID set and "global" flag not provided');
      console.log('\nOptions:');
      console.log('  1. Set DISCORD_GUILD_ID in .env for instant guild deployment');
      console.log('  2. Run with "global" flag: npm run deploy-commands global');
      process.exit(1);
    }

    console.log('\n📊 Deployed Commands:');
    commands.forEach((cmd) => {
      console.log(`  • /${cmd.name} - ${cmd.description}`);
    });
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

deployCommands();
