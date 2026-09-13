export const PLUGIN_ID = "silence-git-sync";

export const GIT_MISSING_MESSAGE =
	"未检测到系统 Git：请先安装 Git 并确保 git 命令已加入系统环境变量 PATH（Windows 安装时勾选 “Add Git to PATH”），然后重启 Obsidian。";

export const MOBILE_MESSAGE =
	"移动端暂不支持：Obsidian 移动版无法调用系统 Git，本插件仅在桌面端提供同步。请在电脑上继续使用。";

export const NOT_GIT_REPO_MESSAGE =
	"当前笔记库不是 Git 仓库，请填写仓库地址，或先在此目录初始化 Git。";

export const NO_ORIGIN_MESSAGE = "当前 Git 仓库没有 origin 远程，请在设置中填写仓库地址。";

export const IGNORE_MARKER_START = "# silence-git-sync";
export const IGNORE_MARKER_END = "# end silence-git-sync";
