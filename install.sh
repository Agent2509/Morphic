#!/usr/bin/env bash
set -e

# Morphic One-Line Installer
# Shape-shifts to your hardware. Codes like a team.

MORPHIC_DIR="${HOME}/.morphic"
BIN_DIR="${HOME}/.local/bin"

echo "======================================================"
echo "  🔮 Morphic Installer"
echo "  Shape-shifts to your hardware. Codes like a team."
echo "======================================================"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
  x86_64|amd64)
    ARCH="x64"
    ;;
  aarch64|arm64)
    ARCH="arm64"
    ;;
  *)
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

echo "✔ Detected System: ${OS} (${ARCH})"

mkdir -p "${BIN_DIR}"
mkdir -p "${MORPHIC_DIR}"

# Check for Bun
if command -v bun >/dev/null 2>&1; then
  echo "✔ Found Bun runtime ($(bun --version))"
else
  echo "📦 Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="${HOME}/.bun/bin:${PATH}"
fi

# Build / link morphic CLI
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/dist/morphic" ]; then
  echo "📦 Installing standalone Morphic binary to ${BIN_DIR}/morphic..."
  cp "${SCRIPT_DIR}/dist/morphic" "${BIN_DIR}/morphic"
  chmod +x "${BIN_DIR}/morphic"
elif [ -f "${SCRIPT_DIR}/bin/cli.ts" ]; then
  echo "🔨 Linking local repository to ${BIN_DIR}/morphic..."
  {
    printf '#!/usr/bin/env bash\n'
    printf 'export PATH="${HOME}/.bun/bin:${PATH}"\n'
    printf 'exec bun %q "$@"\n' "${SCRIPT_DIR}/bin/cli.ts"
  } > "${BIN_DIR}/morphic"
  chmod +x "${BIN_DIR}/morphic"
else
  echo "📥 Installing global npm package..."
  bun add -g morphic-code || npm install -g morphic-code
fi

# Ensure BIN_DIR is on PATH
if [[ ":$PATH:" != *":${BIN_DIR}:"* ]]; then
  echo ""
  echo "⚠️  Note: ${BIN_DIR} is not in your current PATH."
  echo "   Add the following line to your ~/.bashrc or ~/.zshrc:"
  echo ""
  echo "   export PATH=\"${BIN_DIR}:\$PATH\""
  echo ""
fi

echo "======================================================"
echo "  ✔ Morphic installation complete!"
echo "  Run 'morphic' to launch guided setup and calibrate to your hardware."
echo "======================================================"
