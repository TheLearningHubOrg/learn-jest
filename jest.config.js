// Jest configuration for a TypeScript project that ships as native ESM.
// Source files are transformed to CommonJS by SWC for the test run only,
// which keeps jest.mock() hoisting working without --experimental-vm-modules.

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\.ts$': [
      '@swc/jest',
      {
        jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
        module: { type: 'commonjs' },
      },
    ],
  },
  // Source imports use NodeNext-style ".js" suffixes; map them back to the .ts files.
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1',
  },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/types.ts'],
  coverageReporters: ['text', 'lcov'],
  coverageThreshold: {
    global: { branches: 85, functions: 90, lines: 90, statements: 90 },
  },
};
