export const PLUGIN_ID = "silence-git-sync";

export const GIT_MISSING_MESSAGE =
	"未检测到系统 Git：请先安装 Git 并确保 git 命令已加入系统环境变量 PATH（Windows 安装时勾选 “Add Git to PATH”），然后重启 Obsidian。";

export const MOBILE_MESSAGE =
	"Not supported on mobile. Obsidian mobile runs in a sandbox without access to the system Git, so Silence Git Sync only syncs on desktop. On Android you can sync from Termux instead — see the Android section of the README.";

export const NOT_GIT_REPO_MESSAGE =
	"当前笔记库不是 Git 仓库，请填写仓库地址，或先在此目录初始化 Git。";

export const NO_ORIGIN_MESSAGE = "当前 Git 仓库没有 origin 远程，请在设置中填写仓库地址。";

export const IGNORE_MARKER_START = "# silence-git-sync";
export const IGNORE_MARKER_END = "# end silence-git-sync";
