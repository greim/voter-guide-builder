#!/usr/bin/env node
// Runs the TypeScript CLI directly, so there's no build step.
import { register } from 'tsx/esm/api';

register();
await import('../src/cli.ts');
