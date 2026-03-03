import type { PermissionFlagsBits } from 'discord.js';

export interface FilterOptions {
  roles?: RoleFilter;
  joinDate?: DateRangeFilter;
  accountAge?: AccountAgeFilter;
  permissions?: PermissionFilter;
  bots?: BotFilter;
}

export interface RoleFilter {
  include?: string[]; // Role IDs to include
  exclude?: string[]; // Role IDs to exclude
  matchType?: 'any' | 'all'; // Match any role (OR) or all roles (AND)
}

export interface DateRangeFilter {
  after?: Date; // Joined after this date
  before?: Date; // Joined before this date
}

export interface AccountAgeFilter {
  minimumAgeDays?: number; // Minimum account age in days
}

export interface PermissionFilter {
  permissions: (keyof typeof PermissionFlagsBits)[]; // Required permissions
  matchType?: 'any' | 'all'; // Match any permission (OR) or all permissions (AND)
}

export interface BotFilter {
  includeBots: boolean; // If false, exclude all bots
}

export interface AppliedFilters {
  roleCount?: number;
  dateRange?: string;
  accountAge?: string;
  permissionCount?: number;
  includeBots: boolean;
}
