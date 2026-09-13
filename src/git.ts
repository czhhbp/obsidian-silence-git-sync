import { execFile } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { GIT_MISSING_MESSAGE, MOBILE_MESSAGE } from "./constants";

/** 便于上层区分错误类别，避免把配置问题当成普通同步失败。 */
export interface SyncError extends Error {
	stdout?: any;
	stderr?: any;
	gitMissing?: boolean;
	platformUnsupported?: boolean;
}

/**
 * 桌面端才有 Node.js 运行时；移动端为 Capacitor 容器，require 直接抛错会导致插件加载失败，
 * 因此这里统一做探测，并把 Node 模块以可空形式暴露给上层。
 */
export const isDesktopApp = (): boolean => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { Platform } = require("obsidian");
		return Platform?.isDesktopApp === true;
	} catch {
		return false;
	}
};

let execFileFn: typeof execFile | null = null;
let nodeError: Error | null = null;

if (isDesktopApp()) {
	try {
		execFileFn = execFile;
	} catch (error) {
		nodeError = error as Error;
		execFileFn = null;
	}
}

export function platformError(): SyncError | null {
	if (!isDesktopApp()) {
		const error = new Error(MOBILE_MESSAGE) as SyncError;
		error.stderr = MOBILE_MESSAGE;
		error.platformUnsupported = true;
		return error;
	}
	if (!execFileFn) {
		const error = new Error(
			`插件运行环境缺少 Node.js 模块：${nodeError ? nodeError.message : "未知错误"}`
		) as SyncError;
		error.stderr = error.message;
		error.platformUnsupported = true;
		return error;
	}
	return null;
}

export interface RunGitOptions {
	encoding?: BufferEncoding | "buffer";
	env?: NodeJS.ProcessEnv;
}

export interface RunGitResult {
	stdout: any;
	stderr: any;
}

/** 统一封装 git 调用：固定 windowsHide、放大缓冲、识别“未安装 Git”。 */
export function runGit(
	cwd: string,
	args: string[],
	options: RunGitOptions = {}
): Promise<RunGitResult> {
	return new Promise((resolve, reject) => {
		const unavailable = platformError();
		if (unavailable) {
			reject(unavailable);
			return;
		}
		execFileFn!(
			"git",
			args,
			{
				cwd,
				windowsHide: true,
				maxBuffer: 20 * 1024 * 1024,
				encoding: (options.encoding as BufferEncoding) || "utf8",
				env: options.env || process.env,
			},
			(error, stdout, stderr) => {
				if (error) {
					const gitError = error as SyncError;
					if ((error as NodeJS.ErrnoException).code === "ENOENT") {
						const missing = new Error(GIT_MISSING_MESSAGE) as SyncError;
						missing.stderr = GIT_MISSING_MESSAGE;
						missing.gitMissing = true;
						reject(missing);
						return;
					}
					gitError.stdout = stdout;
					gitError.stderr = stderr;
					reject(gitError);
					return;
				}
				resolve({ stdout, stderr });
			}
		);
	});
}

export function formatTime(date: Date): string {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/** 冲突时远程版本落盘为同名兄弟文件，例如笔记.md -> 笔记.sync-remote.md */
export function conflictCopyPath(filePath: string): string {
	const extension = path.extname(filePath);
	return extension
		? `${filePath.slice(0, -extension.length)}.sync-remote${extension}`
		: `${filePath}.sync-remote`;
}

/**
 * 令牌通过临时 GIT_CONFIG_GLOBAL 注入到 http.extraHeader，
 * 避免把凭据写进库内的 .git/config。留空时回退到系统凭据管理器。
 */
export function tokenEnv(token: string): NodeJS.ProcessEnv | null {
	if (!token) return null;
	const header = `AUTHORIZATION: basic ${Buffer.from(
		`x-access-token:${token}`
	).toString("base64")}`;
	const configPath = path.join(
		os.tmpdir(),
		`silence-git-sync-${process.pid}.config`
	);
	fs.writeFileSync(configPath, `[http]\n\textraHeader = ${header}\n`, "utf8");
	return { ...process.env, GIT_CONFIG_GLOBAL: configPath };
}
