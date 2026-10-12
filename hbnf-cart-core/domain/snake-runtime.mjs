import {isOppositeDirection} from "./arcade-input.mjs";

export const SNAKE_WIDTH=32;
export const SNAKE_HEIGHT=16;
const DELTA={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};

export function createSnakeGame({seed=1}={}){
  const snake=[{x:8,y:8},{x:7,y:8},{x:6,y:8}];
  const food=nextFood(snake,seed);
  return {status:"READY",width:SNAKE_WIDTH,height:SNAKE_HEIGHT,snake,direction:"RIGHT",queuedDirection:"RIGHT",food,score:0,ticks:0,speedLevel:0,seed:seed>>>0||1};
}

export function steerSnake(game,direction){
  if(!game||game.status!=="READY"&&game.status!=="PLAY")return game;
  if(!DELTA[direction]||isOppositeDirection(game.direction,direction))return game;
  return {...game,queuedDirection:direction};
}

export function tickSnake(game){
  if(!game||!["READY","PLAY"].includes(game.status))return game;
  const direction=game.queuedDirection,delta=DELTA[direction];
  const head={x:game.snake[0].x+delta[0],y:game.snake[0].y+delta[1]};
  const eating=head.x===game.food.x&&head.y===game.food.y;
  const occupied=eating?game.snake:game.snake.slice(0,-1);
  if(head.x<0||head.x>=game.width||head.y<0||head.y>=game.height||occupied.some(p=>p.x===head.x&&p.y===head.y))return {...game,status:"GAME_OVER",direction,ticks:game.ticks+1};
  const snake=[head,...game.snake.slice(0,eating?game.snake.length:game.snake.length-1)];
  const seed=nextSeed(game.seed);
  return {...game,status:"PLAY",snake,direction,queuedDirection:direction,food:eating?nextFood(snake,seed):game.food,score:game.score+(eating?1:0),ticks:game.ticks+1,speedLevel:Math.floor((game.score+(eating?1:0))/5),seed};
}

export function snakeFrame(game){
  const cells=new Uint8Array(game.width*game.height);
  for(const p of game.snake)cells[p.y*game.width+p.x]=1;
  if(game.food)cells[game.food.y*game.width+game.food.x]=2;
  return cells;
}

function nextFood(snake,seed){
  const occupied=new Set(snake.map(p=>p.y*SNAKE_WIDTH+p.x));
  const free=[];for(let i=0;i<SNAKE_WIDTH*SNAKE_HEIGHT;i++)if(!occupied.has(i))free.push(i);
  if(!free.length)return null;
  const next=nextSeed(seed);const index=next%free.length;return {x:free[index]%SNAKE_WIDTH,y:Math.floor(free[index]/SNAKE_WIDTH)};
}
function nextSeed(seed){let x=seed>>>0||1;x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0||1;}
