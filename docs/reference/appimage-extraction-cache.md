# AppImage extraction cache

Linux AppImage builds extract their payload once into `$XDG_CACHE_HOME/orca/appimage` (default
`~/.cache/orca/appimage`) so the CLI, `orca serve` and anything they start can run from a copy that
does not vanish when the AppImage's FUSE mount does.

## Layout

```
<cache>/launcher/orca-ide            stable wrapper; execs launcher/installed
<cache>/launcher/installed           symlink to <ns>/<generation>/resources/bin/orca-ide
<cache>/<ns>/<generation>/           one extracted payload ("generation")
<cache>/leases/<ns>.<gen>.<pid>.<starttime>.json
```

- `<generation>` is keyed by the AppImage file's identity (device, inode, size, mtime).
- `<ns>` is keyed by the AppImage path **and a layout version**. Builds before generation leases used
  `sha256(path)` alone. Those builds prune every generation in that directory except their own, so new
  builds extract into a directory they never scan. New builds still reclaim idle generations left in the
  old directory for the same path.

## When a generation may be deleted

A pruner deletes a generation only when all of these hold. Every pruner runs under the registration
lock (`withAppImageRegistrationLock`).

1. It is not the generation the pruner keeps, and `installed` does not point at it.
2. No process of this user has its executable in it, according to `/proc/<pid>/exe`.
3. No lease names it and a live process. A lease records the pid, the Linux start ticks and the boot
   id. A different start time means a recycled pid, and a different boot id means a reboot. Both make
   the lease stale, and the pruner deletes it.

If `/proc` or a lease holder cannot be read, the generation is kept. A desktop, `serve` or daemon
process that runs from a generation writes its own lease at startup.

## Remaining window: rollback

Running a pre-lease build again at the same AppImage path brings back its pruner. It scans only the
old directory, so new generations are safe from it. Generations in the old directory, which only
pre-lease builds extract, stay as exposed as they were before this change.

One gap is accepted. A process that `exec`s from a generation just as `installed` is republished and a
pruner runs may lose its copy before `/proc` shows it. `installed` and the pruner's own generation are
never deleted, so only a launch in that instant is exposed.
