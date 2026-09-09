const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

Deno.serve((_req: Request) => json({
  ok: false,
  error: "gone",
  message: "This legacy endpoint has been retired.",
}, 410));
