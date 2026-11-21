import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * 본 앱은 Next.js Server Actions("use server")를 사용하지 않으므로,
 * 외부 스캐너/봇이 보내는 `Next-Action` 헤더 포함 요청을 조기 차단하여
 * `Failed to find Server Action` 에러 로그 노이즈를 방지합니다.
 */
export function middleware(request: NextRequest) {
  if (request.headers.has('next-action')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|images/|fonts/).*)',
  ],
};
