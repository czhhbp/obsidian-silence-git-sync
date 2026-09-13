import { readFileSync, writeFileSync } from "fs";

/**
 * 同步版本号到 manifest.json 和 versions.json。
 *
 * 用法：
 *   1) 通过 npm 钩子（推荐）：npm version patch|minor|major
 *      此时版本号由 npm 注入到 process.env.npm_package_version。
 *   2) 直接指定：node version-bump.mjs 1.2.3
 */

const targetVersion = process.argv[2] ?? process.env.npm_package_version;

if (!targetVersion) {
  console.error(
    "错误：未获取到目标版本号。\n" +
      "  用法一：npm version patch|minor|major\n" +
      "  用法二：node version-bump.mjs <版本号>（例如 node version-bump.mjs 1.0.1）"
  );
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  console.error(`错误：版本号格式不合法：${targetVersion}（应形如 1.2.3）`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");

console.log(`已将版本号更新为 ${targetVersion}（minAppVersion ${minAppVersion}）`);
