#!/bin/sh
# Runs with PUID/PGID (Unraid default: 99/100 = nobody/users) so that files in the assets folder
# belong to the right user.
set -e
PUID="${PUID:-99}"
PGID="${PGID:-100}"
UMASK="${UMASK:-002}"

if [ "$(id -u)" = "0" ]; then
  getent group "$PGID" >/dev/null 2>&1 || groupadd -g "$PGID" p5
  getent passwd "$PUID" >/dev/null 2>&1 || useradd -u "$PUID" -g "$PGID" -M -d /config -s /sbin/nologin p5
  mkdir -p /config
  chown -R "$PUID:$PGID" /config
  umask "$UMASK"
  exec gosu "$PUID:$PGID" "$@"
fi
umask "$UMASK"
exec "$@"
