const SERVER_1 = "GUILD ID HERE";
const SERVER_2 = "GUILD ID HERE";

export const GUILD_TO_ORG: Record<string, string> = {
    [SERVER_1]: "organization-id",
    [SERVER_2]: "organization-id",
};

export const LOG_CHANNELS: Record<string, string> = {
    "organization-id": "CHANNEL ID HERE",
};

export const ORG_TO_GUILDS: Record<string, string[]> = {};

for (const [guild, org] of Object.entries(GUILD_TO_ORG)) {
    if (!ORG_TO_GUILDS[org]) ORG_TO_GUILDS[org] = [];
    ORG_TO_GUILDS[org].push(guild);
}

export const GUILD_ROLES: Record<string, [string, string][]> = {
    [SERVER_1]: [
        ["ON-DUTY ROLE ID", "ON-LEAVE ROLE ID"],
        ["ON-DUTY ROLE ID", "ON-LEAVE ROLE ID"],
        ["ON-DUTY ROLE ID", "ON-LEAVE ROLE ID"],
    ],
    [SERVER_2]: [
        ["ON-DUTY ROLE ID", "ON-LEAVE ROLE ID"],
        ["ON-DUTY ROLE ID", "ON-LEAVE ROLE ID"],
        ["ON-DUTY ROLE ID", "ON-LEAVE ROLE ID"],
    ],
};
