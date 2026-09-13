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
		const stored = (await this.loadData()) as Partial<SilenceGitSyncSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
		this.engine = new GitSyncEngine(this.app, this.settings);

		this.statusBar = this.addStatusBarItem();
		this.statusBar.addClass("silence-git-sync-status");
		this.setStatus("Not yet synced", "muted");

		this.supported = platformError() === null;

		this.addSettingTab(new SilenceGitSyncSettingTab(this.app, this));

		if (!this.supported) {
			// 移动端没有系统 Git：保持插件可加载，但不注册同步入口，避免产生无效操作。
			this.setStatus("Unavailable on mobile", "error");
			return;
		}

		this.addRibbonIcon("sync", "Sync now", () => this.sync("Manual sync", true));

		this.addCommand({
			id: "sync-now",
			name: "Sync now",
			callback: () => this.sync("Manual sync", true),
		});

		this.registerEvent(this.app.vault.on("modify", () => this.scheduleEditSync()));

		this.syncInterval = window.setInterval(
			() => {
				void this.sync("Scheduled sync");
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
				void this.sync("Scheduled sync");
			},
			Math.max(1, this.settings.syncIntervalMinutes) * 60 * 1000
		);
		this.registerInterval(this.syncInterval);
	}

	setStatus(message: string, state: "success" | "error" | "muted"): void {
		this.statusBar.setText(`Last sync: ${message}`);
		this.statusBar.dataset.state = state;
	}

	private scheduleEditSync(): void {
		if (this.pendingEditSync) window.clearTimeout(this.pendingEditSync);
		this.pendingEditSync = window.setTimeout(
			() => {
				this.pendingEditSync = null;
				void this.sync("Sync after edit");
			},
			Math.max(1, this.settings.editDelayMinutes) * 60 * 1000
		);
	}

	async sync(reason: string, manual = false): Promise<void> {
		if (this.syncing) return;

		const unavailable = platformError();
		if (unavailable) {
			this.setStatus(`${formatTime(new Date())} failed`, "error");
			if (manual) new Notice(unavailable.message);
			return;
		}

		this.syncing = true;
		if (manual) new Notice("Sync started");

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
			const rawMessage =
				syncError.stderr || syncError.message || String(error);
			const message = rawMessage.trim();
			this.setStatus(`${formatTime(new Date())} failed`, "error");
			if (manual) {
				new Notice(`Sync failed: ${message}`);
			} else if (syncError.gitMissing || syncError.platformUnsupported) {
				// 后台同步默认静默，但“缺少系统 Git”“环境不支持”属于必须让用户知晓的配置问题。
				new Notice(message, 10000);
			}
		} finally {
			this.syncing = false;
		}
	}
}
