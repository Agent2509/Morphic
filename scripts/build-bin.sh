#!/usr/bin/env bash
set -e

echo "🔨 Building standalone Morphic binary..."
mkdir -p dist

bun build --compile --minify bin/cli.ts --outfile dist/morphic

echo "✔ Binary built successfully at dist/morphic"
ls -lh dist/morphic
