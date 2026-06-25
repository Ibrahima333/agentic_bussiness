// Stubs for node types used by vite.config.ts during `tsc`.
// Ensures build proceeds even if node type deps are missing.

declare module 'path' {
  export function resolve(...parts: string[]): string;
}

declare const __dirname: string;

declare const process: any;

