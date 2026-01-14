# Known Dependency Issues

This document tracks known dependency vulnerabilities and issues in the repository.

## Status

Last updated: 2026-01-14

### evm-gas-schedule-compatibility-regression

**Remaining vulnerabilities:** 9 (8 low, 1 high)

The following vulnerabilities remain after running `npm audit fix`:

1. **elliptic** - Multiple security advisories
   - Status: No fix available without breaking changes
   - Impact: Development/testing only - not used in production
   - Mitigation: Only used for testing purposes with known test keys
   - Tracked via: @hashgraph/sdk dependency chain

2. **glob** (v10.2.0 - 10.4.5) - Command injection via -c/--cmd
   - Severity: High
   - Status: Fix available via `npm audit fix`
   - Note: Not directly used in production contexts

### system-contract-testing

**Note:** The system-contract-testing package has complex dependency chains with several known vulnerabilities in development dependencies:

1. **elliptic** - Cryptographic implementation issues
   - Impact: Testing environment only
   - Used via @hashgraph/sdk, hardhat, and other testing tools
   - Mitigation: Only test keys are used (never production keys)

2. **cookie** - Out of bounds characters vulnerability
   - Impact: Development tooling only (via hardhat/sentry)
   - Not used in production deployments

3. **@smithy/config-resolver** - Defense in depth enhancement
   - Impact: Development dependency
   - Used by AWS SDK in dev dependencies

## Security Considerations

### Test Keys Warning

⚠️ **Important:** All private keys in this repository are for **TESTING ONLY** and are publicly documented. These keys should never be used in production environments.

The following test keys are intentionally exposed in the codebase:
- `TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_1`: f70febf7420398c3892ce79fdc393c1a5487ad27
- `TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_2`: dbe82db504ca6701fbe59e638ceaddbdb691067b
- `TEST_ACCOUNT_ECDSA_PRIVATE_KEY_DER_3`: 84b4d82e6ed64102d0faa6c29bf4e9f541db442f

These are known test keys for local development and CI/CD testing only.

## Recommendations

1. **For Contributors:**
   - Run `npm audit` before adding new dependencies
   - Check the [GitHub Advisory Database](https://github.com/advisories) for new vulnerabilities
   - Prefer dependencies with active maintenance and security updates

2. **For Users:**
   - Only use this repository for testing and development
   - Never use test keys or configurations in production environments
   - Keep dependencies updated by running `npm install` regularly

3. **For Maintainers:**
   - Review this document quarterly
   - Update dependencies when security patches are available
   - Monitor for breaking changes in dependency updates

## Updating Dependencies

To update dependencies safely:

```bash
# Check for updates
npm outdated

# Update to latest compatible versions
npm update

# For security fixes (may include breaking changes)
npm audit fix --force

# Verify tests still pass
npm test
```

## Reporting New Issues

If you discover a new security vulnerability, please follow our [Security Policy](SECURITY.md).
