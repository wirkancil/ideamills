import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/app/lib/settings';

const USEAPI_BASE = 'https://api.useapi.net/v1';

export async function GET() {
  const fromDb = await getSetting('google_flow_email');
  const email = fromDb ?? process.env.USEAPI_GOOGLE_EMAIL ?? '';
  return NextResponse.json({ email });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cookies = (body.cookies as string | undefined)?.trim() ?? '';
  const email = (body.email as string | undefined)?.trim() ?? '';

  if (cookies.length < 10) {
    return NextResponse.json({ error: 'Cookies tidak boleh kosong' }, { status: 400 });
  }

  if (email) {
    await setSetting('google_flow_email', email);
  }

  const token = process.env.USEAPI_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'USEAPI_TOKEN tidak dikonfigurasi' }, { status: 500 });
  }

  const payload: Record<string, string> = { cookies };
  if (email) payload.email = email;

  const res = await fetch(`${USEAPI_BASE}/google-flow/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
