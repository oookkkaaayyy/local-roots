import type { Plugin } from 'vite';

export declare const CART_PREVIEW_BRANCH: string;
export declare const CART_PREVIEW_PATH: string;
export declare function createCartPreviewPlugin(env?: Record<string, string | undefined>): Plugin;
