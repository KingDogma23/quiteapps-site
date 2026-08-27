#!/usr/bin/env bash
#
# Deploy to 20i over SFTP, using an SSH key so no password is ever typed
# or stored in this repo.
#
#   ./deploy.sh                 # dry run — shows what would change
#   ./deploy.sh --live          # actually upload
#
# One-time setup:
#   1. ssh-keygen -t ed25519 -C "quiteapps deploy"
#   2. StackCP → your package → SSH Access → add the PUBLIC key (~/.ssh/id_ed25519.pub)
#   3. Copy the SSH host and username StackCP shows you into the block below.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

# ---- fill these in from StackCP → SSH Access -------------------------------
SSH_HOST="${QUITEAPPS_SSH_HOST:-}"      # e.g. ssh.stackcp.com
SSH_USER="${QUITEAPPS_SSH_USER:-}"      # e.g. quiteapps.co.uk
SSH_PORT="${QUITEAPPS_SSH_PORT:-22}"
REMOTE_DIR="${QUITEAPPS_REMOTE_DIR:-public_html}"
# ---------------------------------------------------------------------------

LIVE=0
[[ "${1:-}" == "--live" ]] && LIVE=1

if [[ -z "$SSH_HOST" || -z "$SSH_USER" ]]; then
  cat <<MSG

  SSH host/user not set. Either edit deploy.sh, or:

    export QUITEAPPS_SSH_HOST=ssh.stackcp.com
    export QUITEAPPS_SSH_USER=your-username

  Both come from StackCP → your package → SSH Access. No password is needed
  or wanted here; authentication is by key.

MSG
  exit 1
fi

echo
echo "Building and auditing before upload…"
node build.mjs >/dev/null
if ! node audit.mjs >/dev/null 2>&1; then
  echo "  Audit failed — not deploying. Run: node audit.mjs"
  exit 1
fi
echo "  Build clean, audit passed."

# --delete keeps the server matching dist/ exactly. Excludes protect anything
# you may have put in public_html by hand.
ARGS=(-az --delete --checksum --human-readable
      --exclude '.well-known' --exclude 'cgi-bin' --exclude '.DS_Store'
      -e "ssh -p ${SSH_PORT}")
[[ $LIVE -eq 0 ]] && ARGS+=(--dry-run --itemize-changes)

echo
[[ $LIVE -eq 0 ]] && echo "DRY RUN — nothing will be uploaded. Re-run with --live to deploy." \
                  || echo "Uploading to ${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/ …"
echo

rsync "${ARGS[@]}" dist/ "${SSH_USER}@${SSH_HOST}:${REMOTE_DIR}/"

if [[ $LIVE -eq 1 ]]; then
  echo
  echo "Done. Check:"
  echo "  curl -sI http://quiteapps.co.uk/ | head -1"
  echo "  curl -s  http://quiteapps.co.uk/robots.txt"
fi
echo
