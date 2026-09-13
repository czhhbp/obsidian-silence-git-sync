import { Notice, Plugin } from "obsidian";
import { formatTime, platformError, SyncError } from "./src/git";
import { DEFAULT_SETTINGS, SilenceGitSyncSettings } from "./src/settings";
import { SilenceGitSyncSettingTab } from "./src/settings-tab";
import { GitSyncEngine } from "./src/sync-engine";

export default class SilenceGitSync extends Plugin {
	settings: SilenceGitSyncSettings;
	supported = false;
	private engine!: GitSyncEngine;
	private syncing = false;
	private pendingEditSync: number | null = null;
	private syncInterval!: number;
	private statusBar!: HTMLElement;

	async onload(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.engine = new GitSyncEngine(this.app, this.settings);

		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("silence-git-sync-status");
		this.setStatus("尚未同步", "muted");

		this.supported = platformError() === null;

		this.addSettingTab(new SilenceGitSyncSettingTab(this.app, this));

		if (!this.supported) {
			// 移动端没有系统 Git：保持插件可加载，但不注册同步入口，避免产生无效操作。
			this.setStatus("移动端不可用", "error");
			return;
		}

		this.addRibbonIcon("sync", "立即同步（Silence Git Sync）", () =>
			this.sync("手动同步", true)
		);

		this.addCommand({
			id: "sync-now",
			name: "立即同步",
			hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "S" }],
			callback: () => this.sync("手动同步", true),
		});

		this.registerEvent(this.app.vault.on("modify", () => this.scheduleEditSync()));

		this.syncInterval = window.setInterval(
			() => {
				void this.sync("定时同步");
			},
			Math.max(1, this.settings.syncIntervalMinutes) * 60 * 1000
		);
		this.registerInterval(this.syncInterval);
	}

	onunload(): void {
		if (this.pendingEditSync) window.clearTimeout(this.pendingEditSync);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// 间隔设置即时生效，避免用户改完还要重启插件。
		this.restartInterval();
	}

	private restartInterval(): void {
		if (!this.supported) return;
		if (this.syncInterval) window.clearInterval(this.syncInterval);
		this.syncInterval = window.setInterval(
			() => {
				void this.sync("定时同步");
			},
			Math.max(1, this.settings.syncIntervalMinutes) * 60 * 1000
		);
		this.registerInterval(this.syncInterval);
	}

	setStatus(message: string, state: "success" | "error" | "muted"): void {
		this.statusBar.setText(`上次同步：${message}`);
		this.statusBar.dataset.state = state;
	}

	private scheduleEditSync(): void {
		if (this.pendingEditSync) window.clearTimeout(this.pendingEditSync);
		this.pendingEditSync = window.setTimeout(
			() => {
				this.pendingEditSync = null;
				void this.sync("编辑后同步");
			},
			Math.max(1, this.settings.editDelayMinutes) * 60 * 1000
		);
	}

	async sync(reason: string, manual = false): Promise<void> {
		if (this.syncing) return;

		const unavailable = platformError();
		if (unavailable) {
			this.setStatus(`${formatTime(new Date())} 失败`, "error");
			if (manual) new Notice(unavailable.message);
			return;
		}

		this.syncing = true;
		if (manual) new Notice("开始同步");

		try {
			await this.engine.sync(reason, {
				isManual: manual,
				onStatus: (message, state) =>
					this.setStatus(`${formatTime(new Date())} ${message}`, state),
				onNotice: (message, duration) => new Notice(message, duration),
			});
		} catch (error) {
			console.error("Silence Git Sync", error);
			const syncError = error as SyncError;
			const message = (syncError.stderr || syncError.message || String(error))
				.toString()
				.trim();
			this.setStatus(`${formatTime(new Date())} 失败`, "error");
			if (manual) {
				new Notice(`同步失败：${message}`);
			} else if (syncError.gitMissing || syncError.platformUnsupported) {
				// 后台同步默认静默，但“缺少系统 Git”“环境不支持”属于必须让用户知晓的配置问题。
				new Notice(message, 10000);
			}
		} finally {
			this.syncing = false;
		}
	}
}
