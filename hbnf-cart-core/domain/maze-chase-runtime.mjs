import {isOppositeDirection} from "./arcade-input.mjs";

export const MAZE_WIDTH=32;
export const MAZE_HEIGHT=16;
const DELTA={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};

function buildMaze(){
  const walls=new Uint8Array(MAZE_WIDTH*MAZE_HEIGHT);
  for(let y=0;y<MAZE_HEIGHT;y++)for(let x=0;x<MAZE_WIDTH;x++){
    if(x===0||y===0||x===MAZE_WIDTH-1||y===MAZE_HEIGHT-1)walls[y*MAZE_WIDTH+x]=1;
    else if(y%4===0&&x%8!==4)walls[y*MAZE_WIDTH+x]=1;
    else if(x%8===0&&y%4!==2)walls[y*MAZE_WIDTH+x]=1;
  }
  // Keep the start pocket connected to the board and provide deterministic corridors.
  for(const [x,y] of [[1,1],[2,1],[3,1],[4,1],[4,2],[4,3],[4,4],[12,2],[20,6],[28,10]])walls[y*MAZE_WIDTH+x]=0;
  const start={x:2,y:2};walls[start.y*MAZE_WIDTH+start.x]=0;
  return walls;
}

export function createMazeChaseGame(){
  const walls=buildMaze(),start={x:2,y:2};
  const pellets=new Uint8Array(MAZE_WIDTH*MAZE_HEIGHT);
  for(let i=0;i<pellets.length;i++)if(!walls[i]&&(i!==start.y*MAZE_WIDTH+start.x))pellets[i]=1;
  const enemies=[{x:27,y:13,direction:"LEFT"},{x:27,y:2,direction:"DOWN"}].filter(p=>!walls[p.y*MAZE_WIDTH+p.x]);
  return {status:"READY",width:MAZE_WIDTH,height:MAZE_HEIGHT,walls,pellets,player:start,direction:"RIGHT",queuedDirection:"RIGHT",enemies,lives:3,score:0,ticks:0};
}

export function steerMazeChase(game,direction){
  if(!game||!["READY","PLAY"].includes(game.status)||!DELTA[direction]||isOppositeDirection(game.direction,direction))return game;
  return {...game,queuedDirection:direction};
}

export function tickMazeChase(game){
  if(!game||!["READY","PLAY"].includes(game.status))return game;
  let player=game.player,direction=game.queuedDirection;
  if(canMove(game.walls,player,direction))player=move(player,direction);else if(!canMove(game.walls,player,game.direction))direction=game.direction;
  const pellets=game.pellets.slice(),index=player.y*game.width+player.x,eats=pellets[index]===1;
  if(eats)pellets[index]=0;
  let score=game.score+(eats?10:0),lives=game.lives;
  const enemies=game.enemies.map((enemy,i)=>moveEnemy(game.walls,enemy,player,game.ticks+i));
  if(enemies.some(e=>e.x===player.x&&e.y===player.y)){lives--;player={x:2,y:2};}
  const cleared=pellets.every(value=>value===0);
  return {...game,status:lives<=0?"GAME_OVER":cleared?"GAME_OVER":"PLAY",walls:game.walls,pellets,player,direction,queuedDirection:direction,enemies,lives,score,ticks:game.ticks+1,roundCleared:cleared};
}

export function mazeChaseFrame(game){
  const cells=new Uint8Array(game.width*game.height);
  for(let i=0;i<cells.length;i++)if(game.walls[i])cells[i]=1;else if(game.pellets[i])cells[i]=2;
  cells[game.player.y*game.width+game.player.x]=3;
  for(const e of game.enemies)cells[e.y*game.width+e.x]=4;
  return cells;
}

function canMove(walls,p,d){const v=DELTA[d];if(!v)return false;const x=p.x+v[0],y=p.y+v[1];return x>0&&x<MAZE_WIDTH-1&&y>0&&y<MAZE_HEIGHT-1&&!walls[y*MAZE_WIDTH+x];}
function move(p,d){const [dx,dy]=DELTA[d];return {x:p.x+dx,y:p.y+dy};}
function moveEnemy(walls,enemy,player,tick){
  const choices=["UP","LEFT","DOWN","RIGHT"].filter(d=>canMove(walls,enemy,d));
  if(!choices.length)return enemy;
  // Deterministic greedy chase with a rotating tie-breaker; no blocking search or randomness.
  choices.sort((a,b)=>distance(move(enemy,a),player)-distance(move(enemy,b),player));
  const best=choices.filter(d=>distance(move(enemy,d),player)===distance(move(enemy,choices[0]),player));
  return {...move(enemy,best[tick%best.length]),direction:best[tick%best.length]};
}
function distance(a,b){return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);}
