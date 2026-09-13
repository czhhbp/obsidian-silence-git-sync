const fs = require("fs");
const path = require("path");
const raw = fs.readFileSync(path.join(__dirname, "lint-out.json"), "utf8").replace(/^\uFEFF/, "");
const data = JSON.parse(raw);
let errs = 0;
let warns = 0;
const byRule = {};
const byFile = {};
for (const f of data) {
	for (const m of f.messages) {
		const k = m.ruleId || "parse-error";
		byRule[k] = (byRule[k] || 0) + 1;
		if (m.severity === 2) errs++;
		else warns++;
	}
	if (f.messages.length) {
		const name = path.basename(f.filePath);
		byFile[name] = f.messages.length;
	}
}
const lines = [];
lines.push(`ERRORS=${errs} WARNINGS=${warns}`);
lines.push("--- by rule ---");
Object.entries(byRule)
	.sort((a, b) => b[1] - a[1])
	.forEach(([k, v]) => lines.push(String(v).padStart(4) + "  " + k));
lines.push("--- by file ---");
Object.entries(byFile)
	.sort((a, b) => b[1] - a[1])
	.forEach(([k, v]) => lines.push(String(v).padStart(4) + "  " + k));
fs.writeFileSync(path.join(__dirname, "lint-stat.txt"), lines.join("\n"), "utf8");
console.log("done");
