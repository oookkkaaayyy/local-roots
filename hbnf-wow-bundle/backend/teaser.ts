// @ts-nocheck
export type TeaserOption={id:number;slug:string;name:string;style:string;visualA:{looks:number[]};visualB:{looks:number[]};};
export const TEASER_OPTIONS:Record<number,TeaserOption>={
1:{id:1,slug:"cosmic-warp",name:"COSMIC WARP",style:"purple / magenta / lime / explosive",visualA:{looks:[23,20,22,42,40]},visualB:{looks:[43,33,34,32,30]}},
2:{id:2,slug:"neon-machine",name:"NEON MACHINE",style:"hot neon / liquid geometry / kinetic",visualA:{looks:[40,42,22,23,43]},visualB:{looks:[33,32,34,31,20]}},
3:{id:3,slug:"psychedelic-overload",name:"PSYCHEDELIC OVERLOAD",style:"magenta / orange / lime / fractal / shimmer",visualA:{looks:[43,33,42,20,23]},visualB:{looks:[34,32,30,31,22]}}
};
export function getTeaserOption(id:any):TeaserOption{const n=Math.max(1,Math.min(3,Math.round(Number(id)||1)));return TEASER_OPTIONS[n];}
