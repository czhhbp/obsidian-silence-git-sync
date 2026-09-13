import {
	App,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
} from "obsidian";
import { MOBILE_MESSAGE } from "./constants";
import type SilenceGitSync from "../main";
import type { SilenceGitSyncSettings } from "./settings";

export class SilenceGitSyncSettingTab extends PluginSettingTab {
	plugin: SilenceGitSync;

	constructor(app: App, plugin: SilenceGitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/** 声明式设置定义，使设置项可被 Obsidian 设置搜索（1.13.0+）检索。 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		if (!this.plugin.supported) return [];
		return [
			{
				name: "Sync now",
				desc: "Run an immediate commit, merge and push.",
				action: () => {
					void this.plugin.sync("Manual sync", true);
				},
			},
			{
				name: "Remote HTTPS URL (optional)",
				desc: "Remote repository to sync to. Leave empty to use the origin of the existing repository in this vault.",
				aliases: ["git remote", "origin", "repository", "url"],
				control: { type: "text", key: "remoteUrl", placeholder: "Leave empty to use the vault's existing Git remote" },
			},
			{
				name: "Access token (optional)",
				desc: "Fill this when the remote requires authentication. GitHub and GitLab use a personal access token. Leave empty to fall back to the system credential manager. The token is only used for the HTTP header of the current sync and is never written to the repository config.",
				aliases: ["token", "pat", "password", "credential"],
				control: { type: "text", key: "token", placeholder: "ghp_xxx or glpat-xxx" },
			},
			{
				name: "Custom .gitignore rules",
				desc: "One path per line, no trailing punctuation. Leave empty to ignore all dot-prefixed files and folders by default. The content is written inside a marked block in the vault's root .gitignore and takes effect on the next sync.",
				aliases: ["ignore", "exclude"],
				control: { type: "textarea", key: "ignoredPaths", placeholder: "For example:\n.cache/\nattachments/", rows: 6 },
			},
			{
				name: "Sync delay after edit (minutes)",
				desc: "Automatically sync once after you stop editing for this long.",
				aliases: ["debounce", "delay"],
				control: { type: "text", key: "editDelayMinutes", placeholder: "1" },
			},
			{
				name: "Scheduled sync interval (minutes)",
				desc: "Automatically commit and push once every this many minutes.",
				aliases: ["interval", "schedule", "periodic"],
				control: { type: "text", key: "syncIntervalMinutes", placeholder: "10" },
			},
		];
	}

	display(): void {
		const { containerEl } = this;
		const settings: SilenceGitSyncSettings = this.plugin.settings;
		containerEl.empty();

		if (!this.plugin.supported) {
			new Setting(containerEl).setDesc(MOBILE_MESSAGE);
			new Setting(containerEl).setDesc(
				"Enabling this plugin on mobile makes no changes; you can use the sync features on desktop."
			);
			return;
		}

		new Setting(containerEl).setDesc(
			"Silently commit, merge and push the current vault in the background using the system Git."
		);

		new Setting(containerEl)
			.setName("Remote HTTPS URL (optional)")
			.setDesc(
				"Remote repository to sync to. Leave empty to use the origin of the existing repository in this vault."
			)			.addText((text) =>
				text
					.setPlaceholder("Leave empty to use the vault's existing Git remote")
					.setValue(settings.remoteUrl)
					.onChange(async (value) => {
						settings.remoteUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Access token (optional)")
			.setDesc(
				"Fill this when the remote requires authentication. GitHub and GitLab use a personal access token. Leave empty to fall back to the system credential manager. The token is only used for the HTTP header of the current sync and is never written to the repository config."
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("Ghp_xxx or glpat-xxx")
					.setValue(settings.token)
					.onChange(async (value) => {
						settings.token = value.trim();
						await this.plugin.saveSettings();
					});
			});

		const ignoreSetting = new Setting(containerEl)
			.setName("Custom .gitignore rules")
			.setDesc(
				"One path per line, no trailing punctuation. Leave empty to ignore all dot-prefixed files and folders by default. The content is written inside a marked block in the vault's root .gitignore and takes effect on the next sync."
			)
			.addTextArea((text) => {
				text
					.setPlaceholder("For example:\n.cache/\nattachments/")
					.setValue(settings.ignoredPaths)
					.onChange(async (value) => {
						settings.ignoredPaths = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 6;
				text.inputEl.addClass("silence-git-sync-ignore-input");
			});
		ignoreSetting.settingEl.addClass("silence-git-sync-ignore-input-container");

		new Setting(containerEl)
			.setName("Sync delay after edit (minutes)")
			.setDesc("Automatically sync once after you stop editing for this long.")
			.addText((text) =>
				text.setValue(String(settings.editDelayMinutes)).onChange(async (value) => {
					settings.editDelayMinutes = Math.max(1, Number(value) || 1);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Scheduled sync interval (minutes)")
			.setDesc("Automatically commit and push once every this many minutes.")
			.addText((text) =>
				text.setValue(String(settings.syncIntervalMinutes)).onChange(async (value) => {
					settings.syncIntervalMinutes = Math.max(1, Number(value) || 1);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("Sync now").addButton((button) =>
			button
				.setButtonText("Sync now")
				.setCta()
				.onClick(() => this.plugin.sync("Manual sync", true))
		);
	}
}
