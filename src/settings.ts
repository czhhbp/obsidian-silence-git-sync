export interface SilenceGitSyncSettings {
	remoteUrl: string;
	token: string;
	ignoredPaths: string;
	editDelayMinutes: number;
	syncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: SilenceGitSyncSettings = {
	remoteUrl: "",
	token: "",
	ignoredPaths: "",
	editDelayMinutes: 5,
	syncIntervalMinutes: 30,
};
