// Jest-dom matchers + Testing Library auto-cleanup for DOM-environment suites
// whose spec files use the conventional global setup instead of importing
// both per file (acceptance tests do).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())
