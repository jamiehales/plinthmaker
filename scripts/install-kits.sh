#!/bin/sh
# Fetches the private ui-kit submodule at the commit this repo pins.
#
# Vercel can't clone private submodules itself (it only supports submodules
# that are publicly reachable over HTTP), so the install step runs this first.
# GIT_SHARED_SUBMODULE_TOKEN is a team-level Vercel shared environment variable:
# a fine-grained GitHub token with read-only Contents access to ui-kit. It
# is passed as a one-off `git -c` rewrite, so it is never written to
# disk or .gitmodules.

set -eu

KITS="ui-kit"

missing() {
  for kit in $KITS; do
    [ -f "vendor/$kit/package.json" ] || return 0
  done
  return 1
}

if ! missing; then
  echo "kit submodules already present"
  exit 0
fi

if [ -z "${GIT_SHARED_SUBMODULE_TOKEN:-}" ]; then
  echo "GIT_SHARED_SUBMODULE_TOKEN is not set; trying an unauthenticated submodule fetch (works only if the kits are public)"
  git submodule update --init
else
  git -c "url.https://x-access-token:${GIT_SHARED_SUBMODULE_TOKEN}@github.com/.insteadOf=https://github.com/" submodule update --init
fi

for kit in $KITS; do
  if [ ! -f "vendor/$kit/package.json" ]; then
    echo "$kit submodule is still missing after fetch" >&2
    exit 1
  fi
done
echo "kit submodules fetched"
