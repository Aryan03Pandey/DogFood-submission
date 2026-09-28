import { NextResponse } from 'next/server'
import { buildOpenApiSpec } from '@/src/server/openapi'

export async function GET() {
  return NextResponse.json(buildOpenApiSpec())
}
