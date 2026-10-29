/** Local-only read-through proxy for the owner-approved, event-bound UDisc export. */
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleUdiscExport, handleUdiscGlowEvents} from '../source-snapshots/hbnf-worker-d1a5f936-20261024/src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(here, '../source-snapshots/hbnf-worker-d1a5f936-20261024/public');
const host = '127.0.0.1';
const port = Number(process.env.HBNF_UDISC_REHEARSAL_PORT || 8767);
const mime = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2'};
const reply = (res, status, body, headers = {}) => { res.writeHead(status, {'Cache-Control':'no-store',...headers}); res.end(body); };

const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname === '/api/udisc-glow/export' || url.pathname === '/api/udisc-glow/events') {
      const upstreamRequest = new Request(new URL(req.url, `http://${req.headers.host || host}`), {method:req.method,headers:req.headers});
      const response = url.pathname === '/api/udisc-glow/events'
        ? await handleUdiscGlowEvents(upstreamRequest)
        : await handleUdiscExport(upstreamRequest);
      const headers = Object.fromEntries(response.headers.entries());
      res.writeHead(response.status, headers);
      if (req.method === 'HEAD') return res.end();
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (req.method!=='GET'&&req.method!=='HEAD') return reply(res,405,'Method not allowed.\n',{'Allow':'GET, HEAD'});
    const pathname=url.pathname==='/'?'/udisc-glow-preview.html':decodeURIComponent(url.pathname);
    const file=resolve(publicRoot,`.${pathname}`);
    if(file!==publicRoot&&!file.startsWith(publicRoot+sep))return reply(res,404,'Not found.\n');
    const info=await stat(file).catch(()=>null); if(!info?.isFile())return reply(res,404,'Not found.\n');
    const body=req.method==='HEAD'?null:await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':String(info.size),'Cache-Control':'no-store'});res.end(body);
  } catch (error) {
    reply(res,500,'Local rehearsal request failed.\n');
    console.error('UDisc rehearsal proxy failure:',error instanceof Error?error.name:'unknown');
  }
});

server.listen(port,host,()=>console.log(`Local UDisc → Glow rehearsal: http://${host}:${port}/udisc-glow-preview.html`));
