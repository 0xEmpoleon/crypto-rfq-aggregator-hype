import { defineConfig } from 'vitest/config';

// Vitest's default glob (**/*.{test,spec}.*) would otherwise collect the
// Playwright specs under e2e/ and crash on their test.describe(). Unit tests
// use *.test.ts; Playwright owns e2e/ via playwright.config.ts.
export default defineConfig({
    test: {
        include: ['**/*.test.ts'],
        exclude: ['node_modules', 'e2e', '.next', 'dist'],
    },
});
