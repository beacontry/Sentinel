#!/usr/bin/env bash
# Rotate JWT_SECRET + CRON_SECRET on the Beacontry production droplet.
#
# Closes operator action items 1 + 2 from docs/legal/security-review-2026-05-17.md.
# Triggered by the 2026-05-17 public-source vuln assessment that found:
#   - JWT_SECRET literal fallback in src/lib/config.ts (now removed in code, but
#     any sessions minted under the old/leaked secret should be invalidated)
#   - CRON_SECRET non-constant-time comparison in 6 cron routes (now fixed in
#     code, but the secret may have been recoverable via timing oracle and
#     should be assumed compromised)
#
# WHAT THIS SCRIPT DOES:
#   1. Generates fresh JWT_SECRET (48 bytes base64) and CRON_SECRET (32 bytes base64)
#   2. Backs up the existing .env file with a timestamped suffix
#   3. Replaces both keys in-place
#   4. Stops + removes + re-runs the container (podman restart does NOT
#      re-read --env-file; only `run` does — see CLAUDE.md Resend runbook)
#   5. Waits for /api/health to return 200
#   6. Prints the new CRON_SECRET so you can update external cron schedulers
#
# WHAT THIS SCRIPT DOES NOT DO:
#   - Update remote cron schedulers. You must paste the new CRON_SECRET into
#     whatever runs your cron jobs (droplet crontab, GitHub Actions, Cloudflare
#     Workers, external scheduler).
#   - Audit Cloudflare cf-connecting-ip presence. Run `./rotate-secrets.sh check-cf`
#     from your local machine for that.
#   - Verify NODE_ENV history. Run `./rotate-secrets.sh check-env` on the droplet.
#
# USAGE:
#   ./rotate-secrets.sh rotate              # interactive (prompts before any change)
#   ./rotate-secrets.sh rotate --yes        # non-interactive
#   ./rotate-secrets.sh rotate --dry-run    # preview only, no changes
#   ./rotate-secrets.sh check-cf            # audit Cloudflare from your local machine
#   ./rotate-secrets.sh check-env           # show current container env keys (on droplet)
#   ./rotate-secrets.sh                     # show this help

set -euo pipefail

# ─── Config — edit if your paths differ ────────────────────────────────
ENV_FILE="/opt/apps/sentinel/.env"
CONTAINER_NAME="sentinel-app"
IMAGE="ghcr.io/beacontry/sentinel:latest"
HEALTH_URL="http://localhost:3010/api/health"
CACHE_VOLUME_HOST="/opt/apps/sentinel/cache"
CACHE_VOLUME_CONTAINER="/data/cache"
APP_DOMAIN="beacontry.com"   # only used by check-cf
# The container runs ROOTLESS under sn-deploy (linger-enabled). The
# image is in sn-deploy's local Podman storage, and sn-deploy is the
# only user with GHCR auth credentials. So all podman ops must be
# invoked via `sudo -u sn-deploy -i podman ...`, NOT plain `podman`
# (which would target root's empty Podman namespace).
APP_USER="sn-deploy"
PODMAN="sudo -u $APP_USER -i podman"

# ─── Colors ────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'; C_GREEN=$'\033[32m'
  C_BLUE=$'\033[34m'; C_DIM=$'\033[2m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=''; C_YELLOW=''; C_GREEN=''; C_BLUE=''; C_DIM=''; C_BOLD=''; C_RESET=''
fi

die() { printf '%s[FAIL]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
info() { printf '%s[INFO]%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok() { printf '%s[ OK ]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[WARN]%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }

show_help() {
  cat <<EOF
${C_BOLD}rotate-secrets.sh${C_RESET} — Beacontry production secret rotation

${C_BOLD}Subcommands:${C_RESET}
  rotate              Rotate JWT_SECRET + CRON_SECRET (run on the droplet as sn-deploy)
                      Flags:
                        --yes        Skip the interactive confirmation prompt
                        --dry-run    Print what would happen; make no changes

  check-cf            Audit Cloudflare cf-connecting-ip / proxy state (run anywhere)
  check-env           Show NODE_ENV + presence of secret keys in the running
                      container (run on the droplet)
  help                This help

${C_BOLD}Defaults:${C_RESET}
  ENV_FILE        $ENV_FILE
  CONTAINER       $CONTAINER_NAME
  IMAGE           $IMAGE
  HEALTH_URL      $HEALTH_URL

${C_BOLD}What rotation does:${C_RESET}
  1. Generates fresh JWT_SECRET (48-byte base64) + CRON_SECRET (32-byte base64)
  2. Backs up $ENV_FILE → $ENV_FILE.bak.<timestamp>
  3. Replaces both keys in $ENV_FILE (in-place)
  4. podman stop + rm + run (env-file is only re-read on \`run\`)
  5. Polls $HEALTH_URL until 200 (timeout: 30s)
  6. Prints the new CRON_SECRET so you can update external schedulers

${C_BOLD}Effects on users:${C_RESET}
  - All existing user sessions invalidated. Users see "Sign in" on next request.
    This is intentional and unavoidable on a JWT-secret rotation.
  - Cron jobs will return 401 until you update their x-cron-secret header.

${C_BOLD}Rollback:${C_RESET}
  If the new container fails health checks:
    sudo cp $ENV_FILE.bak.<timestamp> $ENV_FILE
    podman stop $CONTAINER_NAME; podman rm $CONTAINER_NAME
    # re-run the original podman run command from before this script
EOF
}

# ─── Pre-flight checks ────────────────────────────────────────────────
preflight() {
  command -v openssl >/dev/null || die "openssl not found"
  command -v podman >/dev/null || die "podman not found (this script is for the prod droplet — run check-cf on your local machine)"
  command -v curl >/dev/null || die "curl not found"
  command -v sed >/dev/null || die "sed not found"
  [[ -f "$ENV_FILE" ]] || die "$ENV_FILE does not exist"
  [[ -r "$ENV_FILE" ]] || die "$ENV_FILE not readable — try with sudo"
  grep -q "^JWT_SECRET=" "$ENV_FILE" || warn "$ENV_FILE does not contain a JWT_SECRET= line (script will not add it; abort and add it manually first)"
  grep -q "^CRON_SECRET=" "$ENV_FILE" || warn "$ENV_FILE does not contain a CRON_SECRET= line (same as above)"
}

# ─── Rotate ───────────────────────────────────────────────────────────
cmd_rotate() {
  local skip_confirm=false
  local dry_run=false

  for arg in "$@"; do
    case "$arg" in
      --yes|-y) skip_confirm=true ;;
      --dry-run|-n) dry_run=true ;;
      *) die "Unknown flag: $arg" ;;
    esac
  done

  preflight

  local ts new_jwt new_cron backup_file

  ts=$(date +%Y%m%d-%H%M%S)
  backup_file="${ENV_FILE}.bak.${ts}"
  new_jwt=$(openssl rand -base64 48 | tr -d '\n')
  new_cron=$(openssl rand -base64 32 | tr -d '\n')

  printf '\n%s═══ Rotation plan ═══%s\n' "$C_BOLD" "$C_RESET"
  printf '  %sEnv file%s        %s\n' "$C_DIM" "$C_RESET" "$ENV_FILE"
  printf '  %sBackup%s          %s\n' "$C_DIM" "$C_RESET" "$backup_file"
  printf '  %sContainer%s       %s → restart (stop+rm+run)\n' "$C_DIM" "$C_RESET" "$CONTAINER_NAME"
  printf '  %sImage%s           %s\n' "$C_DIM" "$C_RESET" "$IMAGE"
  printf '  %sHealth check%s    %s (poll 30s for 200)\n' "$C_DIM" "$C_RESET" "$HEALTH_URL"
  printf '  %sNew JWT_SECRET%s  %s%s…%s%s (will not be saved to history)\n' \
    "$C_DIM" "$C_RESET" "$C_YELLOW" "${new_jwt:0:8}" "${new_jwt: -4}" "$C_RESET"
  printf '  %sNew CRON_SECRET%s %s%s…%s%s (will be printed at end)\n' \
    "$C_DIM" "$C_RESET" "$C_YELLOW" "${new_cron:0:8}" "${new_cron: -4}" "$C_RESET"
  echo

  if $dry_run; then
    info "Dry-run — no changes made."
    exit 0
  fi

  if ! $skip_confirm; then
    printf '%sThis will:%s\n' "$C_BOLD" "$C_RESET"
    printf '  • Invalidate all existing user sessions (forced log-out)\n'
    printf '  • Break every running cron job until you update its x-cron-secret\n'
    printf '  • Briefly stop %s during the restart (~5-10s)\n\n' "$CONTAINER_NAME"
    read -p "Proceed? Type 'rotate' to confirm: " confirm
    [[ "$confirm" == "rotate" ]] || die "Aborted."
  fi

  info "Backing up $ENV_FILE → $backup_file"
  cp -p "$ENV_FILE" "$backup_file" || die "Backup failed — refusing to proceed"
  ok "Backup created"

  info "Replacing JWT_SECRET + CRON_SECRET in $ENV_FILE"
  # Use | as sed delimiter — base64 contains / and + that conflict with default /.
  # The values contain no | character (base64 alphabet is A-Za-z0-9+/=).
  sed -i "s|^JWT_SECRET=.*$|JWT_SECRET=${new_jwt}|" "$ENV_FILE"
  sed -i "s|^CRON_SECRET=.*$|CRON_SECRET=${new_cron}|" "$ENV_FILE"

  # Verify the lines were actually replaced (catches the case where the env-file
  # didn't have the keys present in the first place).
  if ! grep -q "^JWT_SECRET=${new_jwt}$" "$ENV_FILE"; then
    warn "JWT_SECRET line was not replaced (was the original line present?). Restoring backup."
    cp -p "$backup_file" "$ENV_FILE"
    die "Rotation aborted; .env restored from backup."
  fi
  ok "Env file updated"

  info "Restarting container as $APP_USER (rootless Podman; restart doesn't reload --env-file)"
  $PODMAN stop "$CONTAINER_NAME" 2>/dev/null || warn "Container was not running"
  $PODMAN rm "$CONTAINER_NAME" 2>/dev/null || warn "Container did not exist"

  $PODMAN run -d --name "$CONTAINER_NAME" --network=host \
    --env-file "$ENV_FILE" \
    -e NODE_ENV=production -e HOSTNAME=0.0.0.0 -e PORT=3010 \
    -e NEXT_TELEMETRY_DISABLED=1 -e CACHE_DIR="$CACHE_VOLUME_CONTAINER" \
    -v "${CACHE_VOLUME_HOST}:${CACHE_VOLUME_CONTAINER}:Z" \
    --restart always -m 2g \
    "$IMAGE" >/dev/null || die "podman run failed"
  ok "Container started"

  info "Polling $HEALTH_URL for HTTP 200 (timeout 30s)"
  local i status
  for i in $(seq 1 30); do
    status=$(curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" 2>/dev/null || echo "000")
    if [[ "$status" == "200" ]]; then
      ok "Health check passed after ${i}s"
      break
    fi
    sleep 1
  done

  if [[ "$status" != "200" ]]; then
    warn "Health check did not pass within 30s (last status: $status)"
    warn "Inspect logs:  sudo -u $APP_USER -i podman logs $CONTAINER_NAME --tail 50"
    warn "Rollback:      sudo cp $backup_file $ENV_FILE && $PODMAN stop $CONTAINER_NAME && $PODMAN rm $CONTAINER_NAME && <re-run with old env>"
    die "Rotation completed but container is not healthy."
  fi

  printf '\n%s═══ Rotation complete ═══%s\n\n' "$C_GREEN" "$C_RESET"
  printf '%sNew CRON_SECRET (paste this into your cron scheduler):%s\n' "$C_BOLD" "$C_RESET"
  printf '%s%s%s\n\n' "$C_YELLOW" "$new_cron" "$C_RESET"

  printf '%sNext steps:%s\n' "$C_BOLD" "$C_RESET"
  printf '  1. Update each cron job header:\n'
  printf '     curl -H "x-cron-secret: <NEW_CRON_SECRET>" https://%s/api/cron/<route>\n' "$APP_DOMAIN"
  printf '  2. Verify the new secret works (test one route manually):\n'
  printf '     curl -H "x-cron-secret: %s" https://%s/api/cron/check-accuracy\n' "$new_cron" "$APP_DOMAIN"
  printf '  3. Users currently logged in will see "Sign in" on next request — expected.\n'
  printf '  4. Backup of old env is at %s (delete after a week if no issues)\n\n' "$backup_file"
  printf '%sThe JWT_SECRET is NOT printed — it lives only in %s and the running container.%s\n' "$C_DIM" "$ENV_FILE" "$C_RESET"
}

# ─── Cloudflare audit ─────────────────────────────────────────────────
cmd_check_cf() {
  command -v curl >/dev/null || die "curl not found"

  info "Checking Cloudflare proxy state for $APP_DOMAIN"
  local headers
  headers=$(curl -sD - -o /dev/null "https://${APP_DOMAIN}/api/health" 2>/dev/null) || die "Could not reach https://${APP_DOMAIN}"

  echo "$headers" | grep -iE '^(cf-ray|cf-cache-status|server):' || true

  if echo "$headers" | grep -qi '^cf-ray:'; then
    ok "Cloudflare is proxying $APP_DOMAIN (cf-ray header present)"
  else
    warn "No cf-ray header — $APP_DOMAIN may not be proxied through Cloudflare"
    warn "If so, rate-limit-ip.ts will fall back to 'unknown' and rate limits will collapse to a single bucket"
  fi

  echo
  info "Manual verification steps in the Cloudflare dashboard:"
  printf '  1. DNS → confirm the A/AAAA for %s shows Proxy status \"Proxied\" (orange cloud)\n' "$APP_DOMAIN"
  printf '  2. Rules → Transform Rules → Managed Transforms → \"Add visitor location headers\" should be ON\n'
  printf '  3. Network → confirm minimum TLS version 1.2 or higher\n\n'
  info "If all three are correct, cf-connecting-ip will be populated on every inbound request."
}

# ─── Env history check (droplet only) ─────────────────────────────────
cmd_check_env() {
  command -v podman >/dev/null || die "podman not found (this command runs on the droplet)"

  printf '\n%s═══ Container current env ═══%s\n' "$C_BOLD" "$C_RESET"
  $PODMAN inspect "$CONTAINER_NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | grep -E '^(NODE_ENV|JWT_SECRET|CRON_SECRET|ENCRYPTION_KEY|ALLOW_LIVE_TRADING)=' \
    | sed -E 's/^(NODE_ENV=.*)$/\1/; s/^(JWT_SECRET|CRON_SECRET|ENCRYPTION_KEY)=.{0,8}.*$/\1=<set, redacted>/; s/^(ALLOW_LIVE_TRADING=.*)$/\1/' \
    || warn "Container $CONTAINER_NAME not running — cannot inspect"

  printf '\n%s═══ NODE_ENV history (last 14 days) ═══%s\n' "$C_BOLD" "$C_RESET"
  if command -v journalctl >/dev/null; then
    # Look for any container event mentioning NODE_ENV. journald has the
    # creation events for each container instance with --env-file expanded.
    sudo journalctl CONTAINER_NAME="$CONTAINER_NAME" --since '14 days ago' 2>/dev/null \
      | grep -oE 'NODE_ENV=[^ ]+' \
      | sort -u \
      || warn "No NODE_ENV entries in journald — that's normal if container restarts have been infrequent"
  else
    warn "journalctl not available — check podman events manually:  podman events --since '14d' --filter 'event=create'"
  fi

  echo
  info "If NODE_ENV was ever NOT 'production' during the JWT_SECRET fallback window:"
  info "  - Bump AUTH_CONFIG.cookieName in src/lib/config.ts to a new value (one deploy cycle)"
  info "  - This force-invalidates any cookies issued with old cookie name → old JWT_SECRET pair"
  info "  - Revert the cookie name on the next deploy after users have re-authenticated"
}

# ─── Main ─────────────────────────────────────────────────────────────
main() {
  local cmd="${1:-help}"
  shift || true

  case "$cmd" in
    rotate)    cmd_rotate "$@" ;;
    check-cf)  cmd_check_cf "$@" ;;
    check-env) cmd_check_env "$@" ;;
    help|-h|--help|"") show_help ;;
    *) printf 'Unknown command: %s\n\n' "$cmd"; show_help; exit 1 ;;
  esac
}

main "$@"
