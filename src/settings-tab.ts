import { App, PluginSettingTab, Setting } from "obsidian";
import { MOBILE_MESSAGE } from "./constants";
import type SilenceGitSync from "../main";
import type { SilenceGitSyncSettings } from "./settings";

export class SilenceGitSyncSettingTab extends PluginSettingTab {
	plugin: SilenceGitSync;

	constructor(app: App, plugin: SilenceGitSync) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const settings: SilenceGitSyncSettings = this.plugin.settings;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Silence Git Sync" });

		if (!this.plugin.supported) {
			containerEl.createEl("p", { text: MOBILE_MESSAGE });
			containerEl.createEl("p", {
				text: "在移动端启用本插件不会造成任何修改，你可以在电脑端正常使用同步功能。",
			});
			return;
		}

		containerEl.createEl("p", {
			text: "使用系统 Git 在后台静默提交、合并并推送当前笔记库。",
		});

		new Setting(containerEl)
			.setName("仓库 HTTPS 地址（可选）")
			.setDesc(
				"要同步到的远程仓库地址，例如：https://github.com/user/repo.git。留空时使用当前笔记库已存在的 Git 仓库及其 origin 远程。"
			)
			.addText((text) =>
				text
					.setPlaceholder("留空则使用笔记库已有的 Git 仓库")
					.setValue(settings.remoteUrl)
					.onChange(async (value) => {
						settings.remoteUrl = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("访问令牌（可选）")
			.setDesc(
				"仓库需要身份验证时填写。GitHub/GitLab 使用 Personal Access Token（需 repo / write_repository 权限）；留空则回退到系统 Git 凭据管理器。令牌只用于本次同步的 HTTP 头，不会写入 .git/config。"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setPlaceholder("ghp_xxx 或 glpat-xxx")
					.setValue(settings.token)
					.onChange(async (value) => {
						settings.token = value.trim();
						await this.plugin.saveSettings();
					});
			});

		const ignoreSetting = new Setting(containerEl)
			.setName(".gitignore")
			.setDesc(
				"一行一个路径，不需要末尾标点。留空时默认忽略所有点号开头的文件和文件夹。内容会写入库根目录 .gitignore 的标记区间内，下次同步时生效。"
			)
			.addTextArea((text) => {
				text
					.setPlaceholder("例如：\n.cache/\n附件/")
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
			.setName("编辑后同步延迟（分钟）")
			.setDesc("停止编辑一段时间后自动同步一次。")
			.addText((text) =>
				text.setValue(String(settings.editDelayMinutes)).onChange(async (value) => {
					settings.editDelayMinutes = Math.max(1, Number(value) || 1);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("定时同步间隔（分钟）")
			.setDesc("每隔该时间自动提交并推送一次。")
			.addText((text) =>
				text.setValue(String(settings.syncIntervalMinutes)).onChange(async (value) => {
					settings.syncIntervalMinutes = Math.max(1, Number(value) || 1);
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl).setName("立即同步").addButton((button) =>
			button
				.setButtonText("立即执行")
				.setCta()
				.onClick(() => this.plugin.sync("手动同步", true))
		);
	}
}
