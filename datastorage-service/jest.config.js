module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/migrations/**',
    '!src/services/index.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
};
