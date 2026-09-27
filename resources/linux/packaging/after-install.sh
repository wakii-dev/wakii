#!/bin/bash
# Why: register the bundled `orca-ide` CLI on PATH at package-install time.
# The in-app "Install CLI" action (CliInstaller) can never run on a headless
# server, so without this symlink `orca serve` is unreachable from the shell on
# the exact hosts that need it most. deb/rpm both run this after unpacking.
#
# The shim resolves the real app by walking up from its own location, so a
# symlink works. We discover the install dir instead of hardcoding /opt/Orca
# because electron-builder's directory name can vary by productName sanitization.
set -e

link="/usr/bin/orca-ide"

is_owned_link() {
  [ -L "$link" ] || return 1
  local link_target candidate candidate_target
  link_target="$(readlink -f -- "$link" 2>/dev/null || true)"
  for candidate in /opt/Orca/resources/bin/orca-ide /opt/orca-ide/resources/bin/orca-ide /opt/orca/resources/bin/orca-ide; do
    candidate_target="$(readlink -f -- "$candidate" 2>/dev/null || true)"
    if [ -n "$candidate_target" ] && [ "$link_target" = "$candidate_target" ]; then
      return 0
    fi
  done
  return 1
}

for dir in /opt/Orca /opt/orca-ide /opt/orca; do
  sandbox="$dir/chrome-sandbox"
  if [ -f "$sandbox" ]; then
    # Why: packaged Linux installs must leave Chromium's sandbox helper usable
    # on hosts where unprivileged user namespaces are unavailable.
    chmod 4755 "$sandbox" || true
  fi

  shim="$dir/resources/bin/orca-ide"
  if [ -x "$shim" ]; then
    # Only manage our own symlink; never clobber an unrelated /usr/bin/orca-ide.
    if { [ ! -e "$link" ] && [ ! -L "$link" ]; } || is_owned_link; then
      ln -sfn -- "$shim" "$link"
    fi
    break
  fi
done

# Why: `.wakii` is a brand-new MIME type shared-mime-info does not know, and a desktop
# entry's MimeType= can only reference a REGISTERED type (the .mdx lesson). The package
# therefore ships the type + glob itself and refreshes the database. AppImage has no
# install step, so it cannot do this — documented limitation: open via drag-drop / Open With.
wakii_mime="/usr/share/mime/packages/orca-ide.wakii.xml"
if mkdir -p -- "$(dirname "$wakii_mime")" 2>/dev/null; then
  cat > "$wakii_mime" <<'WAKII_MIME_XML' || true
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/vnd.wakii-mindmap">
    <comment>Wakii Mindmap Story File</comment>
    <sub-class-of type="application/json"/>
    <glob pattern="*.wakii"/>
  </mime-type>
</mime-info>
WAKII_MIME_XML
  if command -v update-mime-database >/dev/null 2>&1; then
    update-mime-database /usr/share/mime || true
  fi
fi

exit 0
