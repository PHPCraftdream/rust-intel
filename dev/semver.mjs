// Full SemVer 2.0.0 grammar (semver.org, official regex), not an approximation.
// Rejects leading zeros in numeric identifiers (01.2.3, 1.2.3-alpha.01) and empty
// prerelease/build identifiers (1.2.3-alpha..1) that a loose `\d+\.\d+\.\d+(-...)?` regex lets through.
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function isValidSemver(value) {
  return typeof value === 'string' && SEMVER_RE.test(value);
}
