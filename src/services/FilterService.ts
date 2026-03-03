import { GuildMember, PermissionsBitField } from 'discord.js';
import type { FilterOptions, AppliedFilters } from '../types/filter.types.js';
import { logger } from '../utils/logger.js';

/**
 * FilterService - Applies various filters to guild members
 */
export class FilterService {
  /**
   * Filter members based on provided filter options
   */
  public filter(members: GuildMember[], filters?: FilterOptions): GuildMember[] {
    if (!filters) {
      logger.debug('No filters provided, returning all members');
      return members;
    }

    logger.info(`Applying filters to ${members.length} members`);
    const startTime = Date.now();

    let filtered = members;

    // Apply bot filter
    if (filters.bots !== undefined) {
      filtered = this.filterBots(filtered, filters.bots.includeBots);
      logger.debug(`After bot filter: ${filtered.length} members`);
    }

    // Apply role filter
    if (filters.roles) {
      filtered = this.filterByRoles(filtered, filters.roles);
      logger.debug(`After role filter: ${filtered.length} members`);
    }

    // Apply join date filter
    if (filters.joinDate) {
      filtered = this.filterByJoinDate(filtered, filters.joinDate);
      logger.debug(`After join date filter: ${filtered.length} members`);
    }

    // Apply account age filter
    if (filters.accountAge) {
      filtered = this.filterByAccountAge(filtered, filters.accountAge);
      logger.debug(`After account age filter: ${filtered.length} members`);
    }

    // Apply permission filter
    if (filters.permissions) {
      filtered = this.filterByPermissions(filtered, filters.permissions);
      logger.debug(`After permission filter: ${filtered.length} members`);
    }

    const durationMs = Date.now() - startTime;
    logger.info(
      `Filtering completed: ${filtered.length}/${members.length} members passed filters (${durationMs}ms)`,
    );

    return filtered;
  }

  /**
   * Filter members by bot status
   */
  private filterBots(members: GuildMember[], includeBots: boolean): GuildMember[] {
    if (includeBots) {
      return members;
    }

    return members.filter((member) => !member.user.bot);
  }

  /**
   * Filter members by roles
   */
  private filterByRoles(
    members: GuildMember[],
    roleFilter: NonNullable<FilterOptions['roles']>,
  ): GuildMember[] {
    const { include, exclude, matchType = 'any' } = roleFilter;

    return members.filter((member) => {
      const memberRoleIds = member.roles.cache.map((role) => role.id);

      // Check exclude list first
      if (exclude && exclude.length > 0) {
        const hasExcludedRole = exclude.some((roleId) => memberRoleIds.includes(roleId));
        if (hasExcludedRole) {
          return false;
        }
      }

      // Check include list
      if (include && include.length > 0) {
        if (matchType === 'all') {
          // Member must have ALL included roles
          return include.every((roleId) => memberRoleIds.includes(roleId));
        } else {
          // Member must have ANY included role
          return include.some((roleId) => memberRoleIds.includes(roleId));
        }
      }

      return true;
    });
  }

  /**
   * Filter members by join date
   */
  private filterByJoinDate(
    members: GuildMember[],
    dateFilter: NonNullable<FilterOptions['joinDate']>,
  ): GuildMember[] {
    const { after, before } = dateFilter;

    return members.filter((member) => {
      if (!member.joinedAt) {
        return false;
      }

      const joinedTimestamp = member.joinedAt.getTime();

      if (after && joinedTimestamp < after.getTime()) {
        return false;
      }

      if (before && joinedTimestamp > before.getTime()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Filter members by account age
   */
  private filterByAccountAge(
    members: GuildMember[],
    accountAgeFilter: NonNullable<FilterOptions['accountAge']>,
  ): GuildMember[] {
    const { minimumAgeDays } = accountAgeFilter;

    if (!minimumAgeDays) {
      return members;
    }

    const minimumTimestamp = Date.now() - minimumAgeDays * 24 * 60 * 60 * 1000;

    return members.filter((member) => {
      const createdTimestamp = member.user.createdTimestamp;
      return createdTimestamp <= minimumTimestamp;
    });
  }

  /**
   * Filter members by permissions
   */
  private filterByPermissions(
    members: GuildMember[],
    permissionFilter: NonNullable<FilterOptions['permissions']>,
  ): GuildMember[] {
    const { permissions, matchType = 'any' } = permissionFilter;

    if (permissions.length === 0) {
      return members;
    }

    return members.filter((member) => {
      const memberPermissions = member.permissions;

      if (matchType === 'all') {
        // Member must have ALL specified permissions
        return permissions.every((permission) =>
          memberPermissions.has(PermissionsBitField.Flags[permission]),
        );
      } else {
        // Member must have ANY specified permission
        return permissions.some((permission) =>
          memberPermissions.has(PermissionsBitField.Flags[permission]),
        );
      }
    });
  }

  /**
   * Get a summary of applied filters
   */
  public getFilterSummary(filters?: FilterOptions): AppliedFilters {
    if (!filters) {
      return {
        includeBots: true,
      };
    }

    const summary: AppliedFilters = {
      includeBots: filters.bots?.includeBots ?? true,
    };

    // Role filter summary
    if (filters.roles) {
      const includeCount = filters.roles.include?.length ?? 0;
      const excludeCount = filters.roles.exclude?.length ?? 0;
      if (includeCount > 0 || excludeCount > 0) {
        summary.roleCount = includeCount + excludeCount;
      }
    }

    // Date range summary
    if (filters.joinDate) {
      const parts: string[] = [];
      if (filters.joinDate.after) {
        parts.push(`after ${filters.joinDate.after.toLocaleDateString()}`);
      }
      if (filters.joinDate.before) {
        parts.push(`before ${filters.joinDate.before.toLocaleDateString()}`);
      }
      if (parts.length > 0) {
        summary.dateRange = parts.join(' and ');
      }
    }

    // Account age summary
    if (filters.accountAge?.minimumAgeDays) {
      summary.accountAge = `Minimum ${filters.accountAge.minimumAgeDays} days`;
    }

    // Permission filter summary
    if (filters.permissions && filters.permissions.permissions.length > 0) {
      summary.permissionCount = filters.permissions.permissions.length;
    }

    return summary;
  }

  /**
   * Validate filter options
   */
  public validateFilters(filters: FilterOptions): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Validate date range
    if (filters.joinDate) {
      const { after, before } = filters.joinDate;
      if (after && before && after.getTime() >= before.getTime()) {
        errors.push('Join date "after" must be before "before" date');
      }
    }

    // Validate account age
    if (filters.accountAge?.minimumAgeDays !== undefined) {
      if (filters.accountAge.minimumAgeDays < 0) {
        errors.push('Minimum account age cannot be negative');
      }
      if (filters.accountAge.minimumAgeDays > 365 * 20) {
        errors.push('Minimum account age cannot exceed 20 years');
      }
    }

    // Validate role filters
    if (filters.roles) {
      const { include: includeRoles, exclude: excludeRoles } = filters.roles;
      if (includeRoles && excludeRoles && includeRoles.length > 0 && excludeRoles.length > 0) {
        const overlap = includeRoles.filter((roleId) => excludeRoles.includes(roleId));
        if (overlap.length > 0) {
          errors.push('Cannot include and exclude the same role in filter');
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get statistics about filter results
   */
  public getFilterStats(
    originalCount: number,
    filteredCount: number,
    filters?: FilterOptions,
  ): {
    originalCount: number;
    filteredCount: number;
    removedCount: number;
    removalPercentage: number;
    filterSummary: AppliedFilters;
  } {
    const removedCount = originalCount - filteredCount;
    const removalPercentage = originalCount > 0 ? (removedCount / originalCount) * 100 : 0;

    return {
      originalCount,
      filteredCount,
      removedCount,
      removalPercentage: Math.round(removalPercentage * 100) / 100,
      filterSummary: this.getFilterSummary(filters),
    };
  }
}
