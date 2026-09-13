import * as fs from "fs";
import * as path from "path";
import { FileSystemAdapter } from "obsidian";
import type { App } from "obsidian";
import {
	IGNORE_MARKER_END,
	IGNORE_MARKER_START,
	NO_ORIGIN_MESSAGE,
	NOT_GIT_REPO_MESSAGE,
} from "./constants";
import { conflictCopyPath, runGit, runGitBuffer, SyncError, tokenEnv } from "./git";
import type { SilenceGitSyncSettings } from "./settings";

export interface SyncCallbacks {
	onStatus: (message: string, state: "success" | "error" | "muted") => void;
	onNotice: (message: string, duration?: number) => void;
	isManual: boolean;
}

/**
 * 基于系统 Git 的同步引擎。设计取向是“不丢信息”：
 * 冲突时把远程内容另存为 .sync-remote 副本，原文保留本地版本，随后提交双方。
 */
export class GitSyncEngine {
	private readonly app: App;

	constructor(
		app: App,
		private readonly settings: SilenceGitSyncSettings
	) {
		this.app = app;
	}

	private get vaultPath(): string {
		const adapter = this.app.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return adapter.getBasePath();
		}
		throw new Error("silence-git-sync 仅支持桌面端本地文件系统。");
	}

	/** 把设置里的忽略路径写入库根 .gitignore 的标记区间，便于幂等更新。 */
	async ensureIgnoreRules(): Promise<void> {
		const ignorePath = path.join(this.vaultPath, ".gitignore");
		let content = "";
		try {
			content = fs.readFileSync(ignorePath, "utf8");
		} catch {
			content = "";
		}

		const configured = this.settings.ignoredPaths
			.split(/\r?\n/)
			.map((item) => item.trim().replace(/\\/g, "/"))
			.filter(Boolean);
		// 留空时默认忽略所有点号开头的文件与文件夹（含 .obsidian/.trash/.git）。
		const rules = configured.length ? configured : [".*"];
		const block = `${IGNORE_MARKER_START}\n${rules.join("\n")}\n${IGNORE_MARKER_END}`;
		const markerPattern = new RegExp(
			`${IGNORE_MARKER_START}[\\s\\S]*?${IGNORE_MARKER_END}`,
			"g"
		);
		const next = markerPattern.test(content)
			? content.replace(markerPattern, block)
			: `${content.trimEnd()}${content.trim() ? "\n\n" : ""}${block}\n`;
		if (next !== content) fs.writeFileSync(ignorePath, next, "utf8");
	}

	/**
	 * .gitignore 对已跟踪文件无效。这里把命中忽略规则的已跟踪文件移出索引（保留本地文件），
	 * 使忽略路径改动立即生效。
	 */
	async ensureUntracked(): Promise<void> {
		const outdated = (await runGit(this.vaultPath, [
			"ls-files",
			"-ci",
			"--exclude-standard",
		])).stdout
			.split(/\r?\n/)
			.map((item: string) => item.trim())
			.filter(Boolean);
		if (!outdated.length) return;
		await runGit(this.vaultPath, [
			"rm",
			"-r",
			"--cached",
			"--ignore-unmatch",
			"--",
			...outdated,
		]);
	}

	async ensureRemote(): Promise<void> {
		const configured = this.settings.remoteUrl.trim();
		if (!configured) return; // 留空时沿用笔记库已有的 Git 仓库配置。
		let origin = "";
		try {
			origin = (
				await runGit(this.vaultPath, ["remote", "get-url", "origin"])
			).stdout.trim();
		} catch {
			await runGit(this.vaultPath, ["remote", "add", "origin", configured]);
			return;
		}
		if (origin !== configured) {
			await runGit(this.vaultPath, ["remote", "set-url", "origin", configured]);
		}
	}

	async ensureRepository(): Promise<void> {
		try {
			await runGit(this.vaultPath, ["rev-parse", "--is-inside-work-tree"]);
		} catch (error) {
			if ((error as SyncError)?.gitMissing) throw error;
			throw new Error(NOT_GIT_REPO_MESSAGE);
		}
		try {
			await runGit(this.vaultPath, ["remote", "get-url", "origin"]);
		} catch (error) {
			if ((error as SyncError)?.gitMissing) throw error;
			throw new Error(NO_ORIGIN_MESSAGE);
		}
	}

	async currentBranch(): Promise<string> {
		return (
			(await runGit(this.vaultPath, ["branch", "--show-current"])).stdout.trim() ||
			"main"
		);
	}

	async remoteBranch(branch: string): Promise<string | null> {
		const refs = (
			await runGit(this.vaultPath, [
				"for-each-ref",
				"--format=%(refname:short)",
				"refs/remotes/origin",
			])
		).stdout
			.split(/\r?\n/)
			.map((item: string) => item.trim())
			.filter(Boolean)
			.filter((item: string) => item !== "origin/HEAD");
		return refs.includes(`origin/${branch}`) ? `origin/${branch}` : refs[0] || null;
	}

	/** 冲突保留策略：本地原文保留，远程内容另存副本，两边都提交，确保信息零丢失。 */
	async resolveConflicts(): Promise<void> {
		const names = (
			await runGit(this.vaultPath, [
				"diff",
				"--name-only",
				"--diff-filter=U",
			])
		).stdout
			.split(/\r?\n/)
			.map((item: string) => item.trim())
			.filter(Boolean);
		for (const file of names) {
			const remoteCopy = conflictCopyPath(file);
			try {
				const remote = await runGitBuffer(this.vaultPath, ["show", `:3:${file}`]);
				fs.mkdirSync(path.dirname(path.join(this.vaultPath, remoteCopy)), {
					recursive: true,
				});
				fs.writeFileSync(path.join(this.vaultPath, remoteCopy), remote);
			} catch {
				// 删除/修改类冲突没有可复制的远程对象，跳过即可。
			}
			await runGit(this.vaultPath, ["checkout", "--ours", "--", file]);
			await runGit(this.vaultPath, ["add", "-A", "--", file, remoteCopy]);
		}
		if (names.length) {
			await runGit(this.vaultPath, [
				"commit",
				"-m",
				"silence-git-sync: preserve merge conflicts",
			]);
		}
	}

	async sync(reason: string, callbacks: SyncCallbacks): Promise<void> {
		const { onStatus, onNotice, isManual } = callbacks;
		const gitEnv = tokenEnv(this.settings.token.trim()) || undefined;
		await this.ensureRepository();
		await this.ensureIgnoreRules();
		await this.ensureUntracked();
		await this.ensureRemote();

		const changes = (
			await runGit(this.vaultPath, ["status", "--porcelain"])
		).stdout.trim();
		if (changes) {
			await runGit(this.vaultPath, ["add", "-A"]);
			await runGit(this.vaultPath, ["commit", "-m", `silence-git-sync: ${reason}`]);
		}

		const branch = await this.currentBranch();
		await runGit(this.vaultPath, ["fetch", "origin"], { env: gitEnv });
		const upstream = await this.remoteBranch(branch);
		if (upstream) {
			try {
				await runGit(this.vaultPath, [
					"merge",
					upstream,
					"--no-edit",
					"--allow-unrelated-histories",
				]);
			} catch (mergeError) {
				const conflicts = (
					await runGit(this.vaultPath, [
						"diff",
						"--name-only",
						"--diff-filter=U",
					])
				).stdout.trim();
				// 非冲突类错误（网络、权限等）原样抛出，避免被误判成冲突。
				if (!conflicts) throw mergeError;
				await this.resolveConflicts();
			}
		}

		await runGit(this.vaultPath, ["push", "origin", `HEAD:${branch}`], {
			env: gitEnv,
		});
		onStatus("Success", "success");
		if (isManual) onNotice("Sync succeeded");
	}
}
