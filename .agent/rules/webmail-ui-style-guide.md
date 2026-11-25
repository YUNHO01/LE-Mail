# LEMail 신규 웹서비스 UI 스타일 가이드

신규 웹서비스(새 `apps/*` Next.js 앱 또는 신규 라우트)를 추가할 때는 기존 웹메일(`apps/web`)과 일관된 사용자 경험을 유지하기 위해 아래 디자인 시스템, 레이아웃, 컴포넌트 규칙을 준수합니다.

---

## 1. 기술 스택 및 기본 설정
- **프레임워크**: `Next.js 15` (App Router) + `React 19` + `TypeScript`
- **스타일링**: `Tailwind CSS 3` (`darkMode: 'class'`), `clsx`, `tailwind-merge`
- **아이콘**: `lucide-react` (단일 아이콘 라이브러리 사용, 임의 SVG 남용 금지)
- **HTML 기본 설정** (`app/layout.tsx`):
  - `<html lang="ko" suppressHydrationWarning>`
  - `<body className="antialiased" suppressHydrationWarning>`
  - `viewport.themeColor`: `#0071e3`

---

## 2. 디자인 토큰 (컬러 & 타이포그래피)

### 2.1 핵심 컬러 토큰 (`globals.css`, `tailwind.config.ts`)
| 용도 | 값 / 클래스 | 비고 |
| --- | --- | --- |
| **앱 셸 배경 (`--background`)** | `#f5f5f7` | 사이드바, 헤더, 전체 배경 |
| **기본 텍스트 (`--foreground`)** | `#1d1d1f` | 본문 및 주요 라벨 |
| **보조/비활성 텍스트** | `#86868b`, `#6e6e73`, `text-slate-500` | 부제목, 메타 정보, 아이콘 |
| **브랜드 액센트 (`--icloud-blue`)** | `#0071e3` | 셸 활성 상태, 아바타, 주요 CTA, 로고 그라데이션(`from-[#2997ff] to-[#0071e3]`) |
| **Primary 팔레트 (`tailwind.config.ts`)** | `primary-50` (`#f0f9ff`) ~ `primary-900` (`#0c4a6e`) | 주요 액션 버튼 `.btn-primary` (`#0284c7` / hover `#0369a1`) 및 포커스 링 |
| **상태 컬러** | Danger `#ef4444` / Success `#10b981` | `.btn-danger`, `.btn-success` |
| **셸 구분선 (Hairline)** | `border-black/[0.08]` | 헤더, 사이드바 경계선 |
| **카드 / 입력창 테두리** | `border-gray-200/80`, `border-slate-200`, `#cbd5e1` | 콘텐츠 영역 카드 및 폼 요소 |
| **카드 / 콘텐츠 표면** | `bg-white rounded-xl border border-gray-200/80 shadow-sm` | 기본 카드 컨테이너 |

### 2.2 타이포그래피 (`globals.css`)
- **시스템 폰트 스택**:
  ```css
  font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  ```
- **선택적 한글 웹폰트**: `/fonts/` 경로의 `NanumGothic.woff2`, `NanumMyeongjo.woff2`, `NanumBarunGothic.woff2`, `NanumPenScript.woff2` 활용 가능.

---

## 3. 앱 셸(Shell) 및 레이아웃 구조

신규 웹서비스는 `apps/web/src/components/layout/`(`DashboardLayout.tsx`, `Header.tsx`, `UserSidebar.tsx`) 구조를 표준으로 따릅니다.

1. **전체 프레임**:
   - `flex h-screen overflow-hidden relative bg-[#f5f5f7] text-[#1d1d1f]`
   - `/login`, `/offline` 등 인증 전/예외 경로는 셸 없이 전체 화면 렌더링.
2. **좌측 사이드바 (`w-60`)**:
   - 모바일: `fixed inset-y-0 left-0 z-30` 슬라이드 오버레이 / 데스크톱(`lg:`): `lg:static lg:translate-x-0` 고정.
   - 배경 및 경계선: `bg-[#f5f5f7] text-[#1d1d1f] border-r border-black/[0.08]`
   - **상단 브랜드 헤더 (`h-12`)**: `border-b border-black/[0.08] px-4`, `h-7 w-7 rounded-lg bg-gradient-to-b from-[#2997ff] to-[#0071e3]` 아이콘 박스 + 브랜드명(`text-[15px] font-semibold tracking-tight truncate`) + 서비스 배지(`rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-[#6e6e73]`).
   - **상단 주요 CTA 버튼**: `rounded-xl py-2 px-3.5 text-[13px] font-medium bg-[#0071e3] text-white hover:bg-[#0077ed] active:scale-[0.98] shadow-xs`
3. **상단 헤더 (`h-12`)**:
   - `sticky top-0 z-20 flex h-12 w-full shrink-0 items-center justify-between border-b border-black/[0.08] bg-[#f5f5f7]/90 backdrop-blur-xl px-4`
   - 좌측: 모바일 사이드바 토글 버튼(`lg:hidden`).
   - 우측: 사용자 아바타(`h-7 w-7 rounded-full bg-[#0071e3] text-[11px] font-bold text-white`), 이름(`text-xs font-semibold`), 이메일(`text-[11px] text-[#86868b]`), 로그아웃 버튼.
4. **메인 콘텐츠 영역 (`<main>`)**:
   - **일반 스크롤 페이지**: `overflow-y-auto overflow-x-hidden` + 내부 여백 `px-4 sm:px-6 lg:px-8 py-6 w-full` 및 `space-y-6`.
   - **다단 분할/앱형 화면(메일함, 캘린더 등)**: `overflow-hidden flex flex-col` + `flex-1 flex flex-col min-h-0 w-full`.
   - **페이지 전환 피드백**: 상단 얇은 프로그레스 바(`h-0.5 bg-[#0071e3]`) 및 스켈레톤 오버레이(`bg-slate-50/90 backdrop-blur-xs`).

---

## 4. 공통 UI 컴포넌트 및 유틸리티 클래스

`apps/web/src/components/common/` 및 `apps/web/src/app/globals.css`에 정의된 패턴을 우선 재사용합니다.

- **페이지 헤더 (`PageHeader`)**:
  - 타이틀: `text-2xl font-bold text-slate-900 tracking-tight`
  - 부제목: `text-sm text-slate-500` (타이틀 바로 아래 독립 줄)
  - 우측 액션 슬롯: `flex items-center gap-2 shrink-0`
- **버튼 시스템 (`globals.css`)**:
  - 크기: `.btn`, `.btn-lg`, `.btn-sm`, `.btn-xs` (`border-radius: 0.5rem`, `font-weight: 500`, `transition-duration: 150ms`)
  - 변형: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-success`
- **폼 & 입력 요소**:
  - `.form-input`, `.form-textarea`, `.form-select` (포커스 시 `border-color: #0284c7`, `box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15)`)
  - 검색창: `SearchInput` (Flex 기반 `Search` + `input` + 초기화 `X` 버튼)
  - 드롭다운: `SelectDropdown` (Portal 기반, 화면 경계에 따른 상/하 방향 자동 전환)
  - 기타 공통 컴포넌트: `DatePicker`, `TimePicker`, `ToggleSwitch`, `TableUtilityButtons`
- **인쇄 최적화 (`@media print`)**:
  - `header`, `aside`, `nav`, `.sidebar`, `.no-print`, `[data-print-hidden="true"]`는 인쇄 시 자동 숨김 처리.

---

## 5. 신규 웹서비스 추가 시 체크리스트
1. `apps/<new-service>/`에 `tailwind.config.ts` (`primary` 컬러 확장) 및 `globals.css` (기본 변수, `.btn*`, `.form-*`, `@media print`)를 `apps/web`과 동일하게 구성한다.
2. 레이아웃 셸(`DashboardLayout`, `Header`, `Sidebar`) 및 공통 컴포넌트(`PageHeader`, `SearchInput`, `SelectDropdown` 등)를 `apps/web` 규격에 맞춰 적용한다.
3. 모노레포 연동 파일(`package.json`, `ecosystem.config.js`, `scripts/package-dist.js`, `scripts/sync-workspace-deps.js`, `.versionrc.json`) 및 문서(`README.md`, `docs/`)를 `project-architecture-standards.md` 규칙에 따라 함께 갱신한다.
