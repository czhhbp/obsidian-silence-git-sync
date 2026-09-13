import obsidianmd from "eslint-plugin-obsidianmd";

export default [
	{
		ignores: [
			"main.js",
			"node_modules/**",
			"esbuild.config.mjs",
			"version-bump.mjs",
			"dist/**",
			"lint-stat.cjs",
			"lint-out.json",
			"dump-obs.mjs",
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: ["./tsconfig.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"no-undef": "off",
		},
	},
];
