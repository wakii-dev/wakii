#!/bin/bash
# Why: remove the PATH symlink that after-install.sh created, but only if it
# still points into an Orca install dir — never delete an unrelated
# /usr/bin/orca-ide a user or other package may own.
set -e

# RPM passes an instance count; dpkg passes the package lifecycle action.
case "${1-}" in
  0 | remove | purge) ;;
  *) exit 0 ;;
esac

link="/usr/bin/orca-ide"

if [ -L "$link" ]; then
  target="$(readlink "$link" || true)"
  case "$target" in
    /opt/Orca/*|/opt/orca-ide/*|/opt/orca/*)
      rm -f "$link"
      ;;
  esac
fi

# Symmetric cleanup for the .wakii MIME type (application/vnd.wakii-mindmap)
# that after-install.sh registered in /usr/share/mime/packages.
wakii_mime="/usr/share/mime/packages/orca-ide.wakii.xml"
if [ -f "$wakii_mime" ]; then
  rm -f "$wakii_mime"
  if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
  fi
fi

exit 0
