# AIFred web

## 실행 화면 스크린샷 (`npm run screens`)

```powershell
cd web
npm run screens
```

- 결과: `web/screenshots/<시나리오>-<mobile|desktop>.png` (git 제외). 실행할 때마다 폴더를 비우고 새로 만들며, 마지막에 파일 목록을 출력한다.
- 모바일 360×800(배율 2)과 데스크톱 1280×800, 전체 페이지로 찍는다(시나리오에 `fullPage: false`를 주면 보이는 화면만). 전체 페이지 캡처에서는 화면 아래 고정 요소(하단 "+" 막대)가 첫 화면 기준 위치에 찍힌다.
- 설치된 Chrome을 쓴다(`playwright install` 불필요). Vite 개발 서버를 5174 포트(strictPort)에 띄웠다가 끝나면 내린다. 5173 개발 서버와 충돌하지 않는다.
- 실제 서버·DB를 쓰지 않는다. `/api/` 요청은 모두 가짜 응답이다. 시계는 2026-10-13 09:00 KST(Asia/Seoul, ko-KR)로 고정된다.
- vitest(`npm test`)와는 별개다. 캡처 파일은 `screens/*.pw.ts`라 vitest에 잡히지 않는다.

### 시나리오 추가

`screens/scenarios.ts`의 `SCENARIOS` 배열에 항목을 덧붙인다.

```ts
{
  name: 'dashboard-overdue-only',          // 파일 이름: dashboard-overdue-only-mobile.png
  description: '대시보드: 밀린 일만 있는 상태',
  chores: [chore('x', '욕실 청소', 7, '2026-10-01', { icon: '🛁' })], // 생략하면 SAMPLE_CHORES
  // listResponse: { status: 500, body: 'Internal Server Error', contentType: 'text/plain' },
  steps: async (page) => {                 // 대시보드 로딩 뒤 조작. 캡처 직전 상태를 expect로 확인한다.
    await expect(page.getByTestId('summary')).toHaveText('오늘 할 일 1개 (밀린 일 1개 포함)')
  },
  // createResponse: { status: 422, body: '{"detail": []}' }, // POST /api/chores 응답을 고정(저장 실패 캡처용)
  // fullPage: false,                       // 전체 페이지 대신 지금 보이는 화면만 찍는다(고정 요소 확인용)
},
```

- 샘플 데이터와 `chore()` 헬퍼는 `screens/sampleData.ts`에 있다.
- 가짜 API(`screens/screens.pw.ts`)는 추가·수정·삭제를 메모리 목록에 반영하므로 저장 후 대시보드로 돌아가는 흐름도 찍을 수 있다.
- 시나리오 하나만 찍기: `npm run screens -- -g edit-form` (이때도 폴더는 비워진다).
