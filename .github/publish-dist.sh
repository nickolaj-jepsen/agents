#!/bin/sh
# Appends one commit to the `dist` branch: the folder `nix build .#plugins` made, one `<name>/` per
# plugin, which the marketplace installs from. The branch is created (an orphan) when it is missing,
# is only ever fast-forwarded, and gets no commit when nothing differs from its tip.
#
#   publish-dist.sh <built plugins folder>
#
# DIST_REMOTE   where to push (a URL or folder); default: this checkout's `origin`
# DIST_TOKEN    a token to push over https with (CI's GITHUB_TOKEN); default: none
# DIST_SOURCE   the commit of main it was built from, named in the message; default: HEAD here
set -eu

built=${1:?usage: publish-dist.sh <built plugins folder>}
branch=dist
remote=${DIST_REMOTE:-$(git remote get-url origin)}
source_rev=${DIST_SOURCE:-$(git rev-parse HEAD)}

# Nothing of the machine's git leaks into the commit: no user config, no hooks.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
export GIT_AUTHOR_NAME='github-actions[bot]' GIT_COMMITTER_NAME='github-actions[bot]'
export GIT_AUTHOR_EMAIL='41898282+github-actions[bot]@users.noreply.github.com'
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL
if [ -n "${DIST_TOKEN:-}" ]; then
  GIT_CONFIG_COUNT=1
  GIT_CONFIG_KEY_0=http.https://github.com/.extraheader
  GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$DIST_TOKEN" | base64 -w0)"
  export GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
git init --quiet
git config core.hooksPath /dev/null
git remote add origin "$remote"

if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git fetch --quiet --depth 1 origin "refs/heads/$branch"
  git checkout --quiet -B "$branch" FETCH_HEAD
else
  echo "publish-dist: no $branch branch yet, starting one"
  git checkout --quiet --orphan "$branch"
fi

# The tree is exactly the build: what a plugin dropped is dropped here too.
git rm -r --quiet --ignore-unmatch .
find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -rL --no-preserve=mode "$built"/. .
git add -A

if git diff --cached --quiet; then
  echo "publish-dist: $branch already holds this build"
  exit 0
fi

git commit --quiet -m "publish $(printf %.7s "$source_rev")" -m "Built from $source_rev."
git push --quiet origin "$branch"
echo "publish-dist: pushed $(git rev-parse --short HEAD) to $branch"
