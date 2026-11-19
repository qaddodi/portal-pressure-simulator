// The release name a build carries ("v2026.11.3 · ff9c75df"): the newest release tag reachable from THIS checkout, and this checkout's own short commit.
// scripts/build.mjs uses it; PPS_RELEASE overrides it (pages.yml names main's release before the build, so the site names the tag it will carry).
//
// It never reads GITHUB_SHA (SHL-3, 19 Nov 2026): one deploy builds two checkouts (the live site and the preview), and that variable names only the commit that
// triggered the run, so the other copy's About and release.txt named a commit it was not built from.
//
// `git(args)` runs git in the checkout and returns its text ('' when it cannot); `env` is process.env. Both are parameters so a test can run it for real.
export function releaseName(git, env = process.env) {
  if (env.PPS_RELEASE) return env.PPS_RELEASE;
  const tag = git('describe --tags --abbrev=0 --match "v20*"');
  const hash = git('rev-parse HEAD').slice(0, 8);
  return [tag, hash].filter(Boolean).join(' · ') || 'build';
}
