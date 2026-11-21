export const COMPILER_VERSION: string;
export const COMPILER_RULES: Readonly<Record<string, any>>;
export type CompileResult = {
  mask: Uint8Array;
  validation: {islandCount:number;islandFails:any[];necks:any[];thinBlackAreaMm2:number;outsideSafeZoneMm2:number;maxRadiusMm:number;pass:boolean};
  bridges: any[];
  passes: any[];
  fidelity: {vinylRemovedMm2:number;vinylAddedMm2:number;changedFraction:number;largestChangeMm2:number;regionCount:number;topRegions:any[];level:'clean'|'review'|'reject'};
  verdict: 'PASS'|'FAIL'|'REGENERATE';
};
export function compileStencil(mask:Uint8Array,w:number,h:number,mmPerPx:number,rules?:Record<string,any>):CompileResult;
export function validateStencil(mask:Uint8Array,w:number,h:number,mmPerPx:number,rules?:Record<string,any>):CompileResult['validation'];
export function measureChange(before:Uint8Array,after:Uint8Array,w:number,h:number,mmPerPx:number,rules?:Record<string,any>):CompileResult['fidelity'];
export function normalizeArtwork(lum:ArrayLike<number>,w:number,h:number,artworkWidthMm?:number):{mask:Uint8Array;width:number;height:number;origin:[number,number];mmPerPx:number};
export function maskToCutSvg(mask:Uint8Array,w:number,h:number,mmPerPx:number,tolerancePx?:number):string;
export function buildValidatorReport(input:{label:string;mm:number;width:number;height:number;result:CompileResult;sourceSha256:string}):Record<string,any>;
