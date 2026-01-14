# Contributing to Hedera EVM Testing

Thank you for your interest in contributing to Hedera EVM Testing! This document provides guidelines and instructions for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Pull Request Process](#pull-request-process)
- [License](#license)

## Code of Conduct

This project adheres to the Hedera community code of conduct. By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js v22.15.0 or higher
- npm
- Git
- For local testing: Docker, Kubernetes (kind), kubectl, and Solo

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/hedera-evm-testing.git
   cd hedera-evm-testing
   ```

3. Install dependencies:
   ```bash
   # For system contract testing
   cd system-contract-testing
   npm ci
   
   # For EVM gas schedule testing
   cd ../evm-gas-schedule-compatibility-regression
   npm install
   ```

## How to Contribute

### Reporting Bugs

- Check if the bug has already been reported in [Issues](https://github.com/hashgraph/hedera-evm-testing/issues)
- If not, create a new issue with:
  - Clear title and description
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, Node version, etc.)
  - Any relevant logs or screenshots

### Suggesting Enhancements

- Open an issue describing the enhancement
- Explain why this enhancement would be useful
- Provide examples if applicable

### Security Vulnerabilities

**Do not report security vulnerabilities through GitHub issues.** Please see our [Security Policy](SECURITY.md) for reporting instructions.

## Development Workflow

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following our [coding standards](#coding-standards)

3. Test your changes thoroughly

4. Commit your changes with clear, descriptive commit messages:
   ```bash
   git commit -m "feat: add new test for HIP-XXX"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request

## Coding Standards

### JavaScript/Node.js

- Use CommonJS module syntax (`require`/`module.exports`)
- Follow existing code style and formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Include SPDX license header in all source files:
  ```javascript
  // SPDX-License-Identifier: Apache-2.0
  ```

### File Organization

- Keep files focused and single-purpose
- Place utilities in appropriate `utils/` directories
- Follow existing directory structure

### Dependencies

- Minimize new dependencies
- Justify any new dependencies in your PR description
- Check for security vulnerabilities before adding dependencies
- Keep dependencies up to date

## Testing Guidelines

### System Contract Testing

Run tests using:
```bash
cd system-contract-testing
npx hardhat test
```

For local testing with Solo:
```bash
npx hardhat test --network local
```

### EVM Gas Schedule Testing

Run tests using:
```bash
cd evm-gas-schedule-compatibility-regression
npm run test --executors=<executor-list>
```

### Writing Tests

- Write clear, descriptive test names
- Test both success and failure cases
- Include comments explaining complex test scenarios
- Ensure tests are deterministic and don't rely on external state
- Clean up resources after tests

## Pull Request Process

1. **Before submitting:**
   - Ensure all tests pass
   - Update documentation if needed
   - Add/update tests for your changes
   - Follow the coding standards
   - Rebase on latest `main` if needed

2. **PR Description should include:**
   - What changes were made and why
   - Link to related issues
   - Testing performed
   - Any breaking changes
   - Screenshots (if UI changes)

3. **Review process:**
   - At least one maintainer approval is required
   - Address all review comments
   - Keep PR scope focused and manageable
   - Be responsive to feedback

4. **After approval:**
   - Maintainers will merge your PR
   - Your contribution will be part of the next release

## Commit Message Guidelines

Use conventional commit format:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks
- `style:` - Code style changes (formatting, etc.)

Examples:
```
feat: add support for HIP-XXX system contract
fix: resolve gas estimation issue in ERC20 tests
docs: update README with Solo installation steps
test: add integration tests for schedule transactions
```

## License

By contributing to this project, you agree that your contributions will be licensed under the Apache License 2.0. All source files must include the Apache-2.0 SPDX license identifier.

## Questions?

If you have questions about contributing, feel free to:
- Open a discussion in the repository
- Ask in the Hedera Discord
- Reach out to maintainers

Thank you for contributing to Hedera EVM Testing! 🎉
