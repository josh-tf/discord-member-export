import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  PermissionsBitField,
} from 'discord.js';

/**
 * Command execution context
 */
export interface CommandContext {
  interaction: ChatInputCommandInteraction;
}

/**
 * Base interface for all bot commands
 */
export interface Command {
  /**
   * Command data for registration with Discord
   */
  data: Omit<SlashCommandBuilder, 'addSubcommand' | 'addSubcommandGroup'> | SlashCommandBuilder;

  /**
   * Required permissions to execute this command
   */
  requiredPermissions?: PermissionsBitField[];

  /**
   * Whether this command is admin-only
   */
  adminOnly?: boolean;

  /**
   * Cooldown in seconds (0 = no cooldown)
   */
  cooldown?: number;

  /**
   * Execute the command
   */
  execute(context: CommandContext): Promise<void>;

  /**
   * Handle autocomplete interactions (optional)
   */
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>;
}

/**
 * Cooldown tracker
 */
export class CooldownManager {
  private cooldowns = new Map<string, Map<string, number>>();

  /**
   * Check if user is on cooldown for a command
   */
  public isOnCooldown(
    commandName: string,
    userId: string,
    cooldownSeconds: number,
  ): { onCooldown: boolean; remainingSeconds?: number } {
    if (!this.cooldowns.has(commandName)) {
      this.cooldowns.set(commandName, new Map());
    }

    const timestamps = this.cooldowns.get(commandName) as Map<string, number>;
    const now = Date.now();
    const cooldownMs = cooldownSeconds * 1000;

    if (timestamps.has(userId)) {
      const expirationTime = (timestamps.get(userId) as number) + cooldownMs;

      if (now < expirationTime) {
        const remainingSeconds = Math.ceil((expirationTime - now) / 1000);
        return { onCooldown: true, remainingSeconds };
      }
    }

    // Set new cooldown
    timestamps.set(userId, now);

    // Clean up old entries
    this.cleanupOldCooldowns(commandName, cooldownMs);

    return { onCooldown: false };
  }

  /**
   * Remove expired cooldowns
   */
  private cleanupOldCooldowns(commandName: string, cooldownMs: number): void {
    const timestamps = this.cooldowns.get(commandName);
    if (!timestamps) return;

    const now = Date.now();

    for (const [userId, timestamp] of timestamps.entries()) {
      if (now - timestamp > cooldownMs) {
        timestamps.delete(userId);
      }
    }
  }

  /**
   * Clear all cooldowns for a user
   */
  public clearUserCooldowns(userId: string): void {
    for (const timestamps of this.cooldowns.values()) {
      timestamps.delete(userId);
    }
  }

  /**
   * Clear all cooldowns for a command
   */
  public clearCommandCooldowns(commandName: string): void {
    this.cooldowns.delete(commandName);
  }
}
