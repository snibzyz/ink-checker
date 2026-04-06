const fs = require("fs");
const path = require("path");

const target = process.argv[2];

if (!target) {
  console.error("Usage: node scripts/use-manifest.cjs <marketplace|openvsx>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const sourceFile = path.join(root, `package.${target}.json`);
const destinationFile = path.join(root, "package.json");

if (!fs.existsSync(sourceFile)) {
  console.error(`Manifest not found: ${sourceFile}`);
  process.exit(1);
}

fs.copyFileSync(sourceFile, destinationFile);
console.log(`Applied manifest: package.${target}.json`);
