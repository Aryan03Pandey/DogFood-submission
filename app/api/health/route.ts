import { NextResponse } from 'next/server'

export async function GET() { return NextResponse.json({ status: 'ok', service: 'dogfood-2026', offline: true, timestamp: new Date().toISOString() }) }
