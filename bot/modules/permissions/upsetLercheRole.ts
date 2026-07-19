import { Guild, type Role } from "discord.js";
import { PermissionName } from "./permissionNames.ts";
import { upsetRole, setRolePermissions } from "./roles/api.ts";
import { assertLercheCanManageRole, assertLercheCanManageRoles } from "./roles/middleware.ts";

const LERCHE_LISTENS_ROLE_NAME = "Lerche Listens";

const LERCHE_LISTENS_ROLE_PERMISSIONS: PermissionName[] = [
	PermissionName.ViewChannel,
	PermissionName.SendMessages,
	PermissionName.ReadMessageHistory,
	PermissionName.Connect,
	PermissionName.Speak,
];

export async function upsetLercheRole(guild: Guild): Promise<Role> {
	await assertLercheCanManageRoles(guild);

	const role = await upsetRole(guild, LERCHE_LISTENS_ROLE_NAME, {
		mentionable: false,
		hoist: false,
		reason: "Ensure Lerche listens role exists",
	});

	await assertLercheCanManageRole(guild, role);

	return setRolePermissions(
		role,
		LERCHE_LISTENS_ROLE_PERMISSIONS,
		"Ensure Lerche listens role permissions",
	);
}

