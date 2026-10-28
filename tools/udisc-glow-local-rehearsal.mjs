/** Local-only read-through proxy for the owner-approved, event-bound UDisc export. */
import {createServer} from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {basename, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = resolve(here, '../source-snapshots/hbnf-worker-d1a5f936-20261024/public');
const host = '127.0.0.1';
const port = Number(process.env.HBNF_UDISC_REHEARSAL_PORT || 8767);
const maxBytes = 12 * 1024 * 1024;
const eventPattern = /^hb-night-flyers-[a-z0-9-]+-[A-Za-z0-9]{4,12}$/;
const mime = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2'};
const reply = (res, status, body, headers = {}) => { res.writeHead(status, {'Cache-Control':'no-store',...headers}); res.end(body); };

async function readBounded(response) {
  const reader = response.body?.getReader();
  if (!reader) throw Error('The export response has no body.');
  const chunks=[]; let size=0;
  for (;;) {
    const {done,value}=await reader.read(); if(done)break;
    size+=value.byteLength;
    if(size>maxBytes){await reader.cancel();throw Error('The export exceeds the rehearsal size limit.');}
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks,size);
}

const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url || '/', `http://${host}:${port}`);
    if (url.pathname === '/api/udisc-glow/export') {
      if (req.method !== 'GET') return reply(res,405,'Method not allowed.\n',{'Allow':'GET'});
      const eventId=url.searchParams.get('event')||'';
      if (!eventPattern.test(eventId)) return reply(res,400,'Invalid HB Night Flyers event.\n');
      const upstreamUrl=`https://udisc.com/events/${eventId}/leaderboard/export`;
      const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),15000);
      let upstream, bytes;
      try {
        upstream=await fetch(upstreamUrl,{headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},redirect:'manual',signal:controller.signal});
        if (upstream.status>=300&&upstream.status<400) return reply(res,502,'UDisc redirected the export; request stopped.\n');
        if (!upstream.ok) return reply(res,502,`UDisc export unavailable (${upstream.status}).\n`);
        if (!(upstream.headers.get('content-type')||'').includes('spreadsheetml.sheet')) return reply(res,502,'UDisc did not return an XLSX export.\n');
        try { bytes=await readBounded(upstream); } catch(error) { return reply(res,502,`${error.message}\n`); }
      } finally { clearTimeout(timeout); }
      if (bytes.length<22||bytes[0]!==0x50||bytes[1]!==0x4b) return reply(res,502,'UDisc export is not a valid XLSX archive.\n');
      const filename=basename((upstream.headers.get('content-disposition')||'').match(/filename="?([^";]+)"?/i)?.[1]||`${eventId}.xlsx`).replace(/[^A-Za-z0-9._-]/g,'_');
      return reply(res,200,bytes,{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${filename}"`,'X-UDisc-Filename':filename,'X-Source-Observed-At':new Date().toISOString(),'X-Source-Event':eventId});
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
    console.error('UDisc rehearsal proxy failure:',error instanceof Error?error.message:'unknown');
  }
});

server.listen(port,host,()=>console.log(`Local UDisc → Glow rehearsal: http://${host}:${port}/udisc-glow-preview.html`));
