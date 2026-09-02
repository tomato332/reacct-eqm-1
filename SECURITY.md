# 🔒 웹 애플리케이션 보안 가이드라인 (Security Guidelines)

현재 강진모니터 & 지진 조기 경보 애플리케이션에 적용되었거나, 향후 확장을 위해 설계된 프론트엔드 및 백엔드 통합 보안 아키텍처 원칙입니다.

## 1. 환경 변수 노출 방지 (Environment Variables)
* **백엔드 (Node.js)**: KMA API Key(`KMA_AUTH_KEY`)나 디스코드 Webhook URL(`WEBHOOK_URL`) 같은 민감한 정보는 `process.env`를 통해서만 접근하며, 절대 브라우저로 전송하거나 하드코딩하지 않습니다.
* **프론트엔드 (Vite)**: 클라이언트에서 반드시 사용해야 하는 설정값(예: API의 Base URL)의 경우, 반드시 `.env` 파일 내에 `VITE_` 접두어(`import.meta.env.VITE_...`)를 붙여 선언하며, 보안에 치명적인 인증 키는 이곳에 선언하지 않습니다. (관련 가이드는 `.env.example` 참조)

## 2. XSS (Cross-Site Scripting) 방어
* 본 애플리케이션은 React의 기본 렌더링 방식(JSX)을 채택하여 대부분의 XSS 공격을 자동으로 방어(이스케이프 처리)합니다.
* 코드 전반에 걸쳐 `dangerouslySetInnerHTML`의 사용을 원천 차단했습니다.
* 향후 게시판이나 서드파티 위지윅(WYSIWYG) 에디터 등 외부 HTML을 렌더링해야 하는 요구사항이 생길 경우, 반드시 **`DOMPurify`** 와 같은 새니타이저(Sanitizer) 라이브러리를 파이프라인에 의무 적용하도록 설계해야 합니다.

## 3. 라우팅 및 인가 (Client-side Auth & Protected Routes)
* 사용자의 로그인 상태나 권한(Role)별 접근 제어를 위해 HOC(고차 컴포넌트) 기반의 `ProtectedRoute` 구조를 구성했습니다. (참조: `src/components/ProtectedRoute.tsx`)
* 인증되지 않은 사용자가 URL을 통해 강제로 관리자 페이지 등에 진입하려 할 때, 이를 1차적으로 차단하고 Login 페이지로 튕겨내도록 라우팅 구조를 갖출 수 있습니다.

## 4. UI 상태 신뢰 금지 (Zero Trust for Client State)
* "프론트엔드의 상태(State)는 언제든 사용자에 의해 변조될 수 있다"는 보안 철학(Zero Trust)을 준수합니다.
* 따라서 `ProtectedRoute`에서 통과되었다 하더라도, **데이터를 생성(Create), 수정(Update), 삭제(Delete)** 하는 민감한 작업은 100% 백엔드 API에서 JWT 토큰을 기반으로 **사용자 권한을 재검증(Server-side Validation)** 합니다. 프론트엔드의 `isAdmin = true` 값은 단순한 UI 노출용일 뿐, 실제 권한을 담보하지 않습니다.

## 5. 로컬 스토리지 보안 (Storage Security & JWT)
* 향후 로그인 시스템 도입 시 JWT 기반의 토큰을 보관할 때, **보안상 `localStorage`나 `sessionStorage` 저장을 권장하지 않습니다.** (XSS 공격에 의한 토큰 탈취 위험성)
* **권장 아키텍처**: 인증 토큰은 백엔드에서 발급 시 `HttpOnly` 및 `Secure` 속성이 걸린 **Cookie**에 담아 클라이언트로 전송해야 하며, 프론트엔드는 직접 토큰에 접근할 수 없도록 격리해야 합니다. Refresh Token 역시 HttpOnly 쿠키로 관리하고, 프론트엔드는 단기 세션을 갱신하는 `/api/auth/refresh` 형태의 통신 규약을 사용해야 합니다.
