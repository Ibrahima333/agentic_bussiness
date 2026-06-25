/// <reference types="vite/client" />

// Stubs for Node globals/types used by vite.config.ts during `tsc`.
// This repo currently builds with `tsc && vite build`.
declare const __dirname: string;
declare const process: any;
declare module 'path';

