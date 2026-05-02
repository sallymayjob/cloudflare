export function ok(data: unknown, requestId: string, status = 200) {
  return Response.json({ ok: true, data, requestId }, { status });
}

export function fail(errorCode: string, message: string, requestId: string, status = 400) {
  return Response.json({ ok: false, errorCode, message, requestId }, { status });
}
